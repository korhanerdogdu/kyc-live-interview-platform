package tr.com.cs.kyc_live_interview_api.websocket;

import com.corundumstudio.socketio.AckRequest;
import com.corundumstudio.socketio.SocketIOClient;
import com.corundumstudio.socketio.SocketIOServer;
import com.corundumstudio.socketio.annotation.OnConnect;
import com.corundumstudio.socketio.annotation.OnDisconnect;
import com.corundumstudio.socketio.annotation.OnEvent;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tr.com.cs.kyc_live_interview_api.security.JwtTokenService;
import tr.com.cs.kyc_live_interview_api.service.MeetingService;

import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.*;

@Component
@Slf4j
@RequiredArgsConstructor
public class SocketHandler {

    private final SocketIOServer server;
    private final MeetingService meetingService;
    private final JwtTokenService jwtTokenService;

    @Value("${app.disconnect-timeout-seconds:60}")
    private int DISCONNECT_TIMEOUT_SECONDS;

    private static final class ParticipantState {
        ParticipantState(String role) { this.role = role; }
        String role;
        String socketId;
        volatile boolean online;
        volatile boolean dropped; // becomes true on disconnect
        ScheduledFuture<?> timeoutTask;
    }
    private static final class RoomState {
        volatile boolean ended = false;
        final Map<String, ParticipantState> participants = new ConcurrentHashMap<>();
    }

    private final Map<String, RoomState> roomStates = new ConcurrentHashMap<>();
    private static final Map<String, String> users = new ConcurrentHashMap<>();  // sid -> roomId
    private static final Map<String, String> rooms = new ConcurrentHashMap<>();  // roomId -> caller sid

    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(2);

    @PostConstruct
    public void register() {
        server.addListeners(this);
        log.info("SocketHandler registered to SocketIOServer");
    }

    @OnConnect
    public void onConnect(SocketIOClient client) {
        String token = client.getHandshakeData().getSingleUrlParam("token");
        if (!jwtTokenService.isValid(token)) {
            client.sendEvent("unauthorized", "invalid or missing token");
            log.warn("Unauthorized socket connect attempt. sid={}", client.getSessionId());
            client.disconnect();
            return;
        }

        client.set("uid",  jwtTokenService.subject(token));

        String role = jwtTokenService.role(token);
        String roleOverride = client.getHandshakeData().getSingleUrlParam("role");
        if ("operator".equals(roleOverride) || "customer".equals(roleOverride)) {
            role = roleOverride;
        }
        client.set("role", role);

        String sid = client.getSessionId().toString();
        users.put(sid, "");
        log.info("Client connected: {}, uid={}, role={}", sid, client.get("uid"), client.get("role"));
    }

    @OnDisconnect
    public void onDisconnect(SocketIOClient client) {
        final String sid = client.getSessionId().toString();
        final String room = users.remove(sid);
        final String role = (String) client.get("role");

        if (room != null && !room.isEmpty()) {
            client.getNamespace().getRoomOperations(room).getClients().stream()
                    .filter(c -> !c.getSessionId().equals(client.getSessionId()))
                    .forEach(c -> c.sendEvent("peerLeft", Map.of("socketId", sid, "room", room)));

            // clear caller flag if the caller left
            rooms.compute(room, (r, first) -> (first != null && first.equals(sid)) ? null : first);

            client.leaveRoom(room);
            printLog("onDisconnect", client, room);

            if (role != null && !role.isBlank()) {
                markOfflineAndStartTimer(room, role);
            }
        } else {
            log.info("Client disconnected (no room): {}", sid);
        }
    }

    @OnEvent("joinRoom")
    public void onJoinRoom(SocketIOClient client, String roomId) {
        String uid = client.get("uid");
        if (uid == null) {
            client.sendEvent("unauthorized");
            client.disconnect();
            return;
        }

        int connected = server.getRoomOperations(roomId).getClients().size();
        if (connected >= 2) {
            client.sendEvent("full", roomId);
            return;
        }

        client.set("meetingId", roomId);
        client.joinRoom(roomId);
        users.put(client.getSessionId().toString(), roomId);

        // ----- drop/resume bookkeeping -----
        final String role = (String) client.get("role");
        RoomState rs = roomStates.computeIfAbsent(roomId, id -> new RoomState());
        ParticipantState ps = rs.participants.computeIfAbsent(role, ParticipantState::new);
        boolean wasDropped = ps.dropped;
        ps.online = true;
        ps.socketId = client.getSessionId().toString();
        cancelTimer(ps);
        ps.dropped = false; // reset now that they are back

        // ----- ALWAYS (re)elect a valid caller BEFORE other events -----
        String caller = rooms.get(roomId);

        // all present SIDs after this join
        Set<String> present = client.getNamespace()
                .getRoomOperations(roomId)
                .getClients()
                .stream()
                .map(c -> c.getSessionId().toString())
                .collect(java.util.stream.Collectors.toSet());

        final String joinerSid = client.getSessionId().toString();

        if (present.size() == 1) {
            // first in room → caller is the joiner
            rooms.put(roomId, joinerSid);
            caller = joinerSid;
        } else {
            boolean callerPresent = caller != null && present.contains(caller);
            if (!callerPresent) {
                // prefer the peer who was already in the room (not the new joiner)
                String remainingSid = present.stream()
                        .filter(sid -> !sid.equals(joinerSid))
                        .findFirst()
                        .orElse(joinerSid);
                rooms.put(roomId, remainingSid);
                caller = remainingSid;
                log.info("Caller re-elected to remaining peer: {}", caller);
            }
        }

        // 🔑 broadcast caller FIRST so clients know who should offer
        final String callerFinal = caller;
        client.getNamespace().getRoomOperations(roomId).getClients()
                .forEach(c -> c.sendEvent("setCaller", callerFinal));

        // ----- now send rejoin/join events -----
        if (wasDropped) {
            server.getRoomOperations(roomId).sendEvent(
                    "participantRejoined",
                    Map.of("meetingId", roomId, "role", role)
            );
        }

        if (connected == 0) {
            client.sendEvent("roomJoined", Map.of("participants", 1, "room", roomId));
        } else {
            client.sendEvent("roomJoined", Map.of("participants", 2, "room", roomId));

            client.getNamespace().getRoomOperations(roomId).getClients().stream()
                    .filter(c -> !c.getSessionId().equals(client.getSessionId()))
                    .forEach(c -> c.sendEvent("peerJoined",
                            Map.of("socketId", client.getSessionId().toString(), "room", roomId)));

            tryUpdateStatus(roomId, "in_progress");
        }

        printLog("onJoinRoom", client, roomId);
    }

    @OnEvent("leaveRoom")
    public void onLeaveRoom(SocketIOClient client, String roomId) {
        final String sid = client.getSessionId().toString();
        client.leaveRoom(roomId);
        users.put(sid, "");
        client.getNamespace().getRoomOperations(roomId).getClients().forEach(c ->
                c.sendEvent("peerLeft", Map.of("socketId", sid, "room", roomId)));
        printLog("onLeaveRoom", client, roomId);
    }

    @OnEvent("endMeeting")
    public void onEndMeeting(SocketIOClient client, Map<String, Object> payload) {
        if (payload == null) return;

        String sessionId = str(payload.getOrDefault("sessionId", ""));
        if (sessionId.isEmpty()) {
            sessionId = str(payload.getOrDefault("room", ""));
        }
        String by = str(payload.getOrDefault("by", "unknown"));

        if (sessionId.isEmpty()) {
            log.warn("endMeeting missing sessionId/room from {}", client.getSessionId());
            return;
        }

        tryUpdateStatus(sessionId, "completed");
        try { meetingService.endMeeting(UUID.fromString(sessionId), "[socket] user_end by=" + by); } catch (Exception ignore) {}

        markRoomEndedAndCancelTimers(sessionId);

        Map<String, Object> evt = Map.of(
                "sessionId", sessionId,
                "by", by,
                "reason", "user_end",
                "at", System.currentTimeMillis()
        );
        server.getRoomOperations(sessionId).sendEvent("meetingEnded", evt);
        log.info("Broadcast meetingEnded to room={} by={}", sessionId, by);
    }

    public void emitMeetingEndedFromRest(String sessionId, String by) {
        if (sessionId == null || sessionId.isEmpty()) return;

        tryUpdateStatus(sessionId, "completed");
        try { meetingService.endMeeting(UUID.fromString(sessionId), "[rest] user_end by=" + (by == null || by.isBlank() ? "operator" : by)); } catch (Exception ignore) {}

        markRoomEndedAndCancelTimers(sessionId);

        Map<String, Object> evt = Map.of(
                "sessionId", sessionId,
                "by", (by == null || by.isBlank()) ? "operator" : by,
                "reason", "user_end",
                "at", System.currentTimeMillis()
        );
        server.getRoomOperations(sessionId).sendEvent("meetingEnded", evt);
        log.info("[REST→WS] meetingEnded emitted to room={} by={}", sessionId, by);
    }

    @OnEvent("offer")
    public void onOffer(SocketIOClient client, Map<String, Object> payload) {
        relayToOthers(client, payload, "offer");
    }

    @OnEvent("answer")
    public void onAnswer(SocketIOClient client, Map<String, Object> payload) {
        relayToOthers(client, payload, "answer");
    }

    @OnEvent("candidate")
    public void onCandidate(SocketIOClient client, Map<String, Object> payload) {
        relayToOthers(client, payload, "candidate");
    }

    @OnEvent("ready")
    public void onReady(SocketIOClient client, String room, AckRequest ackRequest) {
        client.getNamespace().getBroadcastOperations().sendEvent("ready", room);
        printLog("onReady", client, room);
    }

    private void relayToOthers(SocketIOClient client, Map<String, Object> payload, String event) {
        String room = (String) payload.getOrDefault("room", "");
        if (room.isEmpty()) {
            log.warn("Missing 'room' in {} payload from {}", event, client.getSessionId());
            return;
        }
        client.getNamespace().getRoomOperations(room).getClients().stream()
                .filter(c -> !c.getSessionId().equals(client.getSessionId()))
                .forEach(c -> c.sendEvent(event, payload));

        printLog("on" + Character.toUpperCase(event.charAt(0)) + event.substring(1), client, room);
    }

    private void markOfflineAndStartTimer(String roomId, String role) {
        RoomState rs = roomStates.computeIfAbsent(roomId, id -> new RoomState());
        if (rs.ended) return;

        ParticipantState ps = rs.participants.computeIfAbsent(role, ParticipantState::new);
        ps.online = false;
        ps.dropped = true;

        server.getRoomOperations(roomId).sendEvent("participantDropped",
                Map.of("meetingId", roomId, "role", role, "timeoutSeconds", DISCONNECT_TIMEOUT_SECONDS));

        cancelTimer(ps);

        ps.timeoutTask = scheduler.schedule(() -> {
            if (!ps.online && !rs.ended) {
                try {
                    tryUpdateStatus(roomId, "completed");
                    try { meetingService.endMeeting(UUID.fromString(roomId), "[system_timeout] droppedRole=" + role); } catch (Exception ignore) {}

                    rs.ended = true;
                    rs.participants.values().forEach(this::cancelTimer);

                    Map<String, Object> evt = Map.of(
                            "sessionId", roomId,
                            "by", "system_timeout",
                            "reason", "timeout_disconnect",
                            "droppedRole", role,
                            "at", System.currentTimeMillis()
                    );
                    server.getRoomOperations(roomId).sendEvent("meetingEnded", evt);
                    log.info("Auto-ended meeting {} ({} did not return within {}s)",
                            roomId, role, DISCONNECT_TIMEOUT_SECONDS);
                } catch (Exception e) {
                    log.error("Auto end failed for meeting {}", roomId, e);
                }
            }
        }, DISCONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS);
    }

    private void markRoomEndedAndCancelTimers(String roomId) {
        RoomState rs = roomStates.computeIfAbsent(roomId, id -> new RoomState());
        rs.ended = true;
        rs.participants.values().forEach(this::cancelTimer);
    }

    private void cancelTimer(ParticipantState ps) {
        if (ps != null && ps.timeoutTask != null && !ps.timeoutTask.isDone()) {
            ps.timeoutTask.cancel(true);
            ps.timeoutTask = null;
        }
    }

    private static void printLog(String header, SocketIOClient client, String room) {
        if (room == null || room.isEmpty()) return;
        int size = 0;
        try {
            size = client.getNamespace().getRoomOperations(room).getClients().size();
        } catch (Exception e) {
            log.error("error ", e);
        }
        log.info("#ConnectedClients - {} => room: {}, count: {}", header, room, size);
    }

    private void tryUpdateStatus(String roomId, String status) {
        try {
            UUID uuid = UUID.fromString(roomId);
            meetingService.updateMeetingStatus(uuid, status);
            log.info("Meeting {} marked as {}", roomId, status);
        } catch (IllegalArgumentException e) {
            log.warn("Room id '{}' is not a UUID. Skipping DB status update to {}", roomId, status);
        } catch (Exception e) {
            log.error("Failed to update Meeting {} to {}", roomId, status, e);
        }
    }

    private static String str(Object o) { return o == null ? "" : String.valueOf(o); }
}
