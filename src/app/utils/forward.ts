import { MessageEvent } from '../../types/matrix/room';

type TEventContent = Record<string, unknown>;

export type TForwardableEvent = {
  isRedacted: () => boolean;
  getType: () => string;
  getContent: () => TEventContent;
};

export type TForwardContent = {
  sticker: boolean;
  content: TEventContent;
};

export const getForwardContent = (mEvent: TForwardableEvent): TForwardContent | undefined => {
  if (mEvent.isRedacted()) return undefined;
  const type = mEvent.getType();
  if (type !== MessageEvent.RoomMessage && type !== MessageEvent.Sticker) return undefined;

  const content = mEvent.getContent();
  if (!content || typeof content !== 'object') return undefined;
  if (content.msgtype === 'm.bad.encrypted') return undefined;

  const base = (content['m.new_content'] as TEventContent | undefined) ?? content;
  if (typeof base.body !== 'string' || base.body.length === 0) return undefined;

  const forwarded: TEventContent = { ...base };
  delete forwarded['m.relates_to'];

  return { sticker: type === MessageEvent.Sticker, content: forwarded };
};

export const isForwardableEvent = (mEvent: TForwardableEvent): boolean =>
  getForwardContent(mEvent) !== undefined;
