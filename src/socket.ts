// src/socket.ts
import { Server as HttpServer } from "http";
import { Server as IOServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";

// you'll supply this from your app bootstrap
let io: IOServer | null = null;

export function initSocket(server: HttpServer) {
  io = new IOServer(server, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  io.on("connection", (socket: Socket) => {
    // when admin/client connects, they should send { token, role, attemptId (optional) } via query
    const { token, role, attemptId } = socket.handshake.query as any;

    // basic token verification (implement verifyToken function)
    try {
      if (token) {
        const payload = jwt.verify(
          String(token),
          process.env.JWT_SECRET || "secret"
        );
        // You can attach user info to socket.data
        socket.data.user = payload;
      }
    } catch (err) {
      // invalid token -> still allow but mark as unauthenticated (or disconnect)
    }

    // join admin namespace or attempt room
    if (role === "admin") {
      socket.join("admins");
    }

    if (attemptId) {
      // room per attempt so we can send termination event to that attempt only
      socket.join(`attempt:${attemptId}`);
    }

    socket.on("disconnect", () => {
      // cleanup if needed
    });

    // Handle join event from frontend
    socket.on("join", (room: string) => {
      console.log(`Socket ${socket.id} joining room: ${room}`);
      socket.join(room);
    });

    // Handle voice detection from ML Worker
    socket.on("voice:detection", async (data: {
      attemptId: string;
      speech_probability: number;
      issues: string[];
      risk_score: number;
    }) => {
      try {
        const { attemptId, speech_probability, issues, risk_score } = data;

        const { ExamAttempt } = await import("./entity/ExamAttempt.entity");
        const { CheatEvent } = await import("./entity/CheatEvent.entity");

        // Validate attempt exists
        const attempt = await ExamAttempt.findOne({
          where: { id: attemptId },
        });

        if (!attempt || attempt.isTerminated || attempt.isSubmitted) {
          return; // Ignore detections for invalid/ended attempts
        }

        // Determine severity
        const isMajor = risk_score > 0.7 || issues.some((issue: string) =>
          issue.includes("sustained_speech") || issue.includes("normal_speech")
        );

        const severity = isMajor ? "major" : "minor";
        const eventType = issues.join(", ");

        // Create CheatEvent
        await CheatEvent.create({
          attempt: { id: attemptId } as any,
          eventType: `Voice: ${eventType}`,
          confidence: speech_probability,
          screenshot: null,
          severity: severity,
          causedWarning: !isMajor,
          causedTermination: isMajor,
        }).save();

        // Handle major fraud - immediate termination
        if (isMajor) {
          attempt.isTerminated = true;
          attempt.isSubmitted = true;
          attempt.submittedAt = new Date();
          attempt.terminationReason = `Major voice fraud: ${eventType}`;
          await attempt.save();

          io?.to(`attempt:${attemptId}`).emit("attempt:terminated", {
            attemptId,
            reason: attempt.terminationReason,
            at: new Date(),
          });

          io?.to("admins").emit("attempt:terminated", {
            attemptId,
            reason: attempt.terminationReason,
          });

          return;
        }

        // Handle minor fraud - warning
        attempt.warningCount += 1;
        await attempt.save();

        // Emit warning to student
        io?.to(`attempt:${attemptId}`).emit("cheat:warning", {
          type: "voice",
          message: `Voice detected: ${eventType}`,
          warningCount: attempt.warningCount,
          maxWarnings: attempt.maxWarnings,
        });

        // Emit to admins
        io?.to("admins").emit("cheat:event", {
          attemptId,
          eventType: `Voice: ${eventType}`,
          severity: "minor",
          warningCount: attempt.warningCount,
          maxWarnings: attempt.maxWarnings,
        });

        // Check if max warnings reached
        if (attempt.warningCount >= attempt.maxWarnings) {
          attempt.isTerminated = true;
          attempt.isSubmitted = true;
          attempt.submittedAt = new Date();
          attempt.terminationReason = `Exceeded maximum warnings (${attempt.maxWarnings})`;
          await attempt.save();

          io?.to(`attempt:${attemptId}`).emit("attempt:terminated", {
            attemptId,
            reason: attempt.terminationReason,
            at: new Date(),
          });

          io?.to("admins").emit("attempt:terminated", {
            attemptId,
            reason: attempt.terminationReason,
          });
        }
      } catch (err) {
        console.error("Voice detection handler error:", err);
      }
    });
  });

  return io;
}

export function getIO() {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
}
