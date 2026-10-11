import {
  Avatar,
  Box,
  Button,
  config,
  Header,
  Icon,
  IconButton,
  Icons,
  Input,
  Menu,
  MenuItem,
  Scroll,
  Spinner,
  Text,
  color,
} from 'folds';
import React, {
  ChangeEventHandler,
  MouseEventHandler,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAtomValue } from 'jotai';
import { useVirtualizer } from '@tanstack/react-virtual';
import { EventType, MatrixEvent, Room } from 'matrix-js-sdk';
import { useDirects, useRooms } from '../../state/hooks/roomList';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { allRoomsAtom } from '../../state/room-list/roomList';
import { mDirectAtom } from '../../state/mDirectList';
import { useAllJoinedRoomsSet, useGetRoom } from '../../hooks/useGetRoom';
import { VirtualTile } from '../../components/virtualizer';
import { getDirectRoomAvatarUrl, getRoomAvatarUrl } from '../../utils/room';
import { RoomAvatar } from '../../components/room-avatar';
import { nameInitials } from '../../utils/common';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { factoryRoomIdByAtoZ } from '../../utils/sort';
import {
  SearchItemStrGetter,
  useAsyncSearch,
  UseAsyncSearchOptions,
} from '../../hooks/useAsyncSearch';
import { highlightText, makeHighlightRegex } from '../../plugins/react-custom-html-parser';
import { getForwardContent } from '../../utils/forward';

const SEARCH_OPTS: UseAsyncSearchOptions = {
  limit: 500,
  matchOptions: {
    contain: true,
  },
  normalizeOptions: {
    ignoreWhitespace: false,
  },
};

type ForwardMessageModalProps = {
  room: Room;
  mEvent: MatrixEvent;
  requestClose: () => void;
};
export function ForwardMessageModal({ room, mEvent, requestClose }: ForwardMessageModalProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const mDirects = useAtomValue(mDirectAtom);
  const rooms = useRooms(mx, allRoomsAtom, mDirects);
  const directs = useDirects(mx, allRoomsAtom, mDirects);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [selected, setSelected] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const allRoomsSet = useAllJoinedRoomsSet();
  const getRoom = useGetRoom(allRoomsSet);

  const allItems: string[] = useMemo(
    () => [...rooms, ...directs].filter((rId) => rId !== room.roomId).sort(factoryRoomIdByAtoZ(mx)),
    [rooms, directs, room.roomId, mx]
  );

  const getRoomNameStr: SearchItemStrGetter<string> = useCallback(
    (rId) => getRoom(rId)?.name ?? rId,
    [getRoom]
  );

  const [searchResult, searchRoom, resetSearch] = useAsyncSearch(
    allItems,
    getRoomNameStr,
    SEARCH_OPTS
  );
  const queryHighlighRegex = searchResult?.query
    ? makeHighlightRegex(searchResult.query.split(' '))
    : undefined;

  const items = searchResult ? searchResult.items : allItems;

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 32,
    overscan: 5,
  });
  const vItems = virtualizer.getVirtualItems();

  const handleSearchChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    const value = evt.currentTarget.value.trim();
    if (!value) {
      resetSearch();
      return;
    }
    searchRoom(value);
  };

  const handleRoomClick: MouseEventHandler<HTMLButtonElement> = (evt) => {
    const roomId = evt.currentTarget.getAttribute('data-room-id');
    if (!roomId) return;
    if (selected.includes(roomId)) {
      setSelected(selected.filter((rId) => rId !== roomId));
      return;
    }
    setSelected([...selected, roomId]);
  };

  const handleForward = async () => {
    if (sending || selected.length === 0) return;
    const forwardContent = getForwardContent(mEvent);
    if (!forwardContent) {
      setSendError('This message can no longer be forwarded.');
      return;
    }

    setSending(true);
    setSendError(null);
    const results = await Promise.allSettled(
      selected.map((rId) =>
        forwardContent.sticker
          ? mx.sendEvent(rId, EventType.Sticker, forwardContent.content as any)
          : mx.sendMessage(rId, forwardContent.content as any)
      )
    );
    setSending(false);

    const failedIds = selected.filter((_, i) => results[i].status === 'rejected');
    if (failedIds.length > 0) {
      setSendError(`Failed to forward to ${failedIds.length} of ${selected.length} room(s).`);
      setSelected(failedIds);
      return;
    }
    requestClose();
  };

  const sourceEncrypted = room.hasEncryptionStateEvent();
  const unencryptedSelected = sourceEncrypted
    ? selected.filter((rId) => getRoom(rId)?.hasEncryptionStateEvent() === false).length
    : 0;

  return (
    <Box grow="Yes" direction="Column">
      <Header
        size="500"
        style={{
          padding: config.space.S200,
          paddingLeft: config.space.S400,
        }}
      >
        <Box grow="Yes">
          <Text size="H4">Forward Message</Text>
        </Box>
        <Box shrink="No">
          <IconButton size="300" radii="300" onClick={requestClose}>
            <Icon src={Icons.Cross} />
          </IconButton>
        </Box>
      </Header>
      <Box grow="Yes">
        <Scroll ref={scrollRef} size="300" hideTrack>
          <Box style={{ padding: config.space.S300, paddingRight: 0 }} direction="Column" gap="500">
            <Box
              direction="Column"
              style={{ position: 'sticky', top: config.space.S300, zIndex: 1 }}
            >
              <Input
                onChange={handleSearchChange}
                before={<Icon size="200" src={Icons.Search} />}
                placeholder="Search"
                size="400"
                variant="Background"
                outlined
              />
            </Box>
            {vItems.length === 0 && (
              <Box
                style={{ paddingTop: config.space.S700 }}
                grow="Yes"
                alignItems="Center"
                justifyContent="Center"
                direction="Column"
                gap="100"
              >
                <Text size="H6" align="Center">
                  {searchResult ? 'No Match Found' : 'No Rooms'}
                </Text>
                <Text size="T200" align="Center">
                  {searchResult
                    ? `No match found for "${searchResult.query}".`
                    : 'You do not have any rooms to forward to yet.'}
                </Text>
              </Box>
            )}
            <Box
              style={{
                position: 'relative',
                height: virtualizer.getTotalSize(),
              }}
            >
              {vItems.map((vItem) => {
                const roomId = items[vItem.index];
                const roomTo = getRoom(roomId);
                if (!roomTo) return null;
                const isSelected = selected.includes(roomId);
                const dm = mDirects.has(roomTo.roomId);

                return (
                  <VirtualTile
                    virtualItem={vItem}
                    style={{ paddingBottom: config.space.S100 }}
                    ref={virtualizer.measureElement}
                    key={vItem.index}
                  >
                    <MenuItem
                      data-room-id={roomId}
                      onClick={handleRoomClick}
                      variant={isSelected ? 'Success' : 'Surface'}
                      size="400"
                      radii="400"
                      disabled={sending}
                      aria-pressed={isSelected}
                      before={
                        <Avatar size="200" radii={dm ? '400' : '300'}>
                          <RoomAvatar
                            roomId={roomTo.roomId}
                            src={
                              dm
                                ? getDirectRoomAvatarUrl(mx, roomTo, 96, useAuthentication)
                                : getRoomAvatarUrl(mx, roomTo, 96, useAuthentication)
                            }
                            alt={roomTo.name}
                            renderFallback={() => (
                              <Text as="span" size="H6">
                                {nameInitials(roomTo.name)}
                              </Text>
                            )}
                          />
                        </Avatar>
                      }
                      after={isSelected && <Icon size="200" src={Icons.Check} />}
                    >
                      <Box grow="Yes">
                        <Text truncate size="T400">
                          {queryHighlighRegex
                            ? highlightText(queryHighlighRegex, [roomTo.name])
                            : roomTo.name}
                        </Text>
                      </Box>
                    </MenuItem>
                  </VirtualTile>
                );
              })}
            </Box>
            {selected.length > 0 && (
              <Menu
                style={{
                  position: 'sticky',
                  padding: config.space.S200,
                  paddingLeft: config.space.S400,
                  bottom: config.space.S400,
                  left: config.space.S400,
                  right: 0,
                  zIndex: 1,
                }}
                variant="Success"
              >
                <Box alignItems="Center" gap="400">
                  <Box grow="Yes" direction="Column" gap="100">
                    {sendError ? (
                      <Text size="T200">
                        <b>{sendError}</b>
                      </Text>
                    ) : (
                      <Text size="T200">
                        <b>Forward to {selected.length} room(s).</b>
                      </Text>
                    )}
                    {unencryptedSelected > 0 && (
                      <Text size="T200" style={{ color: color.Critical.Main }}>
                        <b>
                          {unencryptedSelected} unencrypted — message will be readable by anyone in
                          those rooms.
                        </b>
                      </Text>
                    )}
                  </Box>
                  <Box shrink="No" gap="200">
                    <Button
                      size="300"
                      variant="Success"
                      fill="None"
                      radii="300"
                      disabled={sending}
                      onClick={() => {
                        setSelected([]);
                        setSendError(null);
                      }}
                    >
                      <Text size="B300">Clear</Text>
                    </Button>
                    <Button
                      size="300"
                      variant="Success"
                      radii="300"
                      disabled={sending}
                      before={sending && <Spinner variant="Success" fill="Solid" size="100" />}
                      onClick={handleForward}
                    >
                      <Text size="B300">Forward</Text>
                    </Button>
                  </Box>
                </Box>
              </Menu>
            )}
          </Box>
        </Scroll>
      </Box>
    </Box>
  );
}
