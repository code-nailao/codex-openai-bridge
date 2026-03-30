import { PassThrough } from 'node:stream';

import type { FastifyReply } from 'fastify';

export type SseStream = PassThrough;

export function createSseStream(reply: FastifyReply): SseStream {
  const stream = new PassThrough();
  reply.header('content-type', 'text/event-stream; charset=utf-8');
  reply.header('cache-control', 'no-cache, no-transform');
  reply.header('connection', 'keep-alive');
  reply.header('x-accel-buffering', 'no');
  reply.send(stream);
  return stream;
}

export function writeSseData(stream: SseStream, payload: unknown) {
  stream.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export function writeNamedSseEvent(stream: SseStream, eventName: string, payload: unknown) {
  stream.write(`event: ${eventName}\n`);
  stream.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export function writeSseComment(stream: SseStream, comment: string) {
  stream.write(`: ${comment}\n\n`);
}

export function startHeartbeat(stream: SseStream, intervalMs = 15_000): () => void {
  const timer = setInterval(() => {
    writeSseComment(stream, 'heartbeat');
  }, intervalMs);
  timer.unref();

  return () => {
    clearInterval(timer);
  };
}
