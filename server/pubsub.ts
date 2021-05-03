import { EventEmitter, on } from "events";

/**
 * Simple PubSub implementation without any dependencies.
 * @param eventEmitter
 * @returns
 */
export const createPubSub = <TTopicPayload extends { [key: string]: unknown }>(
  eventEmitter: EventEmitter = new EventEmitter()
) => ({
  publish: <TTopic extends Extract<keyof TTopicPayload, string>>(
    topic: TTopic,
    payload: TTopicPayload[TTopic]
  ) => void eventEmitter.emit(topic as string, payload),
  subscribe: async function* <
    TTopic extends Extract<keyof TTopicPayload, string>
  >(topic: TTopic): AsyncIterableIterator<TTopicPayload[TTopic]> {
    const asyncIterator = on(eventEmitter, topic);
    for await (const [value] of asyncIterator) {
      yield value;
    }
  },
});
