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
  });

  return io;
}

export function getIO() {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
}
