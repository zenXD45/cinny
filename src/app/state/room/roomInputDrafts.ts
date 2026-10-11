import { atomFamily } from 'jotai/utils';
import { Descendant } from 'slate';
import { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import { IEventRelation } from 'matrix-js-sdk';
import { createUploadAtomFamily } from '../upload';
import { TUploadContent } from '../../utils/matrix';
import { createListAtom } from '../list';
import {
  atomWithLocalStorage,
  getLocalStorageItem,
  setLocalStorageItem,
} from '../utils/atomWithLocalStorage';

export type TVoiceMessageMetadata = {
  duration: number;
  waveform: number[];
};

export type TUploadMetadata = {
  markedAsSpoiler: boolean;
  voice?: TVoiceMessageMetadata;
};

export type TUploadItem = {
  file: TUploadContent;
  originalFile: TUploadContent;
  metadata: TUploadMetadata;
  encInfo: EncryptedAttachmentInfo | undefined;
};

export type TUploadListAtom = ReturnType<typeof createListAtom<TUploadItem>>;

export const roomIdToUploadItemsAtomFamily = atomFamily<string, TUploadListAtom>(createListAtom);

export const roomUploadAtomFamily = createUploadAtomFamily();

export type RoomIdToMsgAction =
  | {
      type: 'PUT';
      roomId: string;
      msg: Descendant[];
    }
  | {
      type: 'DELETE';
      roomId: string;
    };

const MSG_DRAFT_STORAGE_PREFIX = 'cinny.msgDraft.';
const REPLY_DRAFT_STORAGE_PREFIX = 'cinny.replyDraft.';

const createMsgDraftAtom = (roomId: string) =>
  atomWithLocalStorage<Descendant[]>(
    `${MSG_DRAFT_STORAGE_PREFIX}${roomId}`,
    (key) => {
      const draft = getLocalStorageItem<Descendant[]>(key, []);
      return Array.isArray(draft) ? draft : [];
    },
    (key, value) => {
      if (!Array.isArray(value) || value.length === 0) {
        localStorage.removeItem(key);
        return;
      }
      setLocalStorageItem(key, value);
    }
  );
export type TMsgDraftAtom = ReturnType<typeof createMsgDraftAtom>;
export const roomIdToMsgDraftAtomFamily = atomFamily<string, TMsgDraftAtom>(createMsgDraftAtom);

export type IReplyDraft = {
  userId: string;
  eventId: string;
  body: string;
  formattedBody?: string | undefined;
  relation?: IEventRelation | undefined;
};
const createReplyDraftAtom = (roomId: string) =>
  atomWithLocalStorage<IReplyDraft | undefined>(
    `${REPLY_DRAFT_STORAGE_PREFIX}${roomId}`,
    (key) => {
      const draft = getLocalStorageItem<IReplyDraft | undefined>(key, undefined);
      if (
        draft &&
        typeof draft === 'object' &&
        typeof draft.userId === 'string' &&
        typeof draft.eventId === 'string' &&
        typeof draft.body === 'string'
      ) {
        return draft;
      }
      return undefined;
    },
    (key, value) => {
      if (!value) {
        localStorage.removeItem(key);
        return;
      }
      setLocalStorageItem(key, value);
    }
  );
export type TReplyDraftAtom = ReturnType<typeof createReplyDraftAtom>;
export const roomIdToReplyDraftAtomFamily = atomFamily<string, TReplyDraftAtom>(
  createReplyDraftAtom
);
