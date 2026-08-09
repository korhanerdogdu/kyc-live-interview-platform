package tr.com.cs.kyc_live_interview_api.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.Map;
import java.util.LinkedHashMap;

import org.springframework.web.multipart.MultipartFile;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

import tr.com.cs.kyc_live_interview_api.model.Meeting;
import tr.com.cs.kyc_live_interview_api.dto.MeetingRequest;
import tr.com.cs.kyc_live_interview_api.dto.JoinMeetingRequest;
import tr.com.cs.kyc_live_interview_api.dto.MeetingResponse;
import tr.com.cs.kyc_live_interview_api.dto.EndRequest;
import tr.com.cs.kyc_live_interview_api.service.MeetingService;
import tr.com.cs.kyc_live_interview_api.dto.ScreenshotResponse;
import tr.com.cs.kyc_live_interview_api.model.Screenshot;
import tr.com.cs.kyc_live_interview_api.dto.ScreenshotUploadBase64Request;
import tr.com.cs.kyc_live_interview_api.model.MeetingRecord;
import tr.com.cs.kyc_live_interview_api.dto.MeetingRecordResponse;
import tr.com.cs.kyc_live_interview_api.websocket.SocketHandler; // NEW

@RestController
@RequestMapping("/api/meeting")
public class MeetingController {
    private final MeetingService meetingService;
    private final SocketHandler socketHandler; // NEW

    private static final ZoneId TR = ZoneId.of("Europe/Istanbul");
    private static final DateTimeFormatter RT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(TR);

    private static String realTime(Instant time) {
        return (time == null) ? null : RT.format(time);
    }

    public MeetingController(MeetingService meetingService, SocketHandler socketHandler) {
        this.meetingService = meetingService;
        this.socketHandler = socketHandler;
    }

    @PostMapping("/start")
    public ResponseEntity<MeetingResponse> startMeeting(@RequestBody MeetingRequest request) {
        Meeting meeting = meetingService.startMeeting(request);
        return ResponseEntity.ok(MeetingResponse.from(meeting, "Oturum başarıyla başlatıldı."));
    }

    @GetMapping("/{id}")
    public ResponseEntity<MeetingResponse> getMeeting(@PathVariable UUID id) {
        Meeting meeting = meetingService.getMeetingById(id);
        return meeting != null ? ResponseEntity.ok(MeetingResponse.from(meeting)) : ResponseEntity.notFound().build();
    }

    @GetMapping("/pending")
    public ResponseEntity<List<MeetingResponse>> getPendingMeetings() {
        List<MeetingResponse> responses = meetingService.getPendingMeetings()
                .stream()
                .map(MeetingResponse::from)
                .collect(Collectors.toList());
        return ResponseEntity.ok(responses);
    }

    @PostMapping("/{id}/join")
    public ResponseEntity<MeetingResponse> joinMeeting(
            @PathVariable UUID id,
            @RequestBody JoinMeetingRequest request) {

        Meeting meeting = meetingService.joinMeeting(id, request.getUserId());
        if (meeting == null) {
            return ResponseEntity.badRequest()
                    .body(MeetingResponse.from(null, "Bu oturuma daha fazla kullanıcı katılamaz."));
        }
        return ResponseEntity.ok(MeetingResponse.from(meeting, "Oturuma başarıyla katıldınız"));
    }

    /*@PostMapping("/{id}/end")
    public ResponseEntity<Map<String, Object>> endMeeting(
            @PathVariable UUID id,
            @RequestBody(required = false) EndRequest body) {

        String notes = body != null ? body.getNotes() : null;
        String by = (body != null && body.getBy() != null && !body.getBy().isBlank())
                ? body.getBy() : "operator"; // default for REST

        String videoBase64 = (body != null) ? body.getVideoBase64() : null;
        String videoContentType = (body != null) ? body.getVideoContentType() : null;   // yeni

        boolean updated = meetingService.endMeeting(id, notes,videoBase64,videoContentType);
        if (!updated) {
            return ResponseEntity.status(404).body(Map.of(
                    "status", "not_found",
                    "message", "Oturum bulunamadı"
            ));
        }

        // WS broadcast so the other peer auto-redirects
        socketHandler.emitMeetingEndedFromRest(id.toString(), by);

        Meeting meeting = meetingService.getMeetingById(id);

        try {
            return ResponseEntity.ok(Map.of(
                    "message", "Oturum sonlandırıldı",
                    "status", "completed",
                    "id", id,
                    "notes", notes,
                    "startAt", realTime(meeting.getStartTimestamp()),
                    "endAt",   realTime(meeting.getEndTimestamp())
            ));
        } catch (NullPointerException e) {
            Map<String, Object> safeResp = new LinkedHashMap<>();
            safeResp.put("message", "Oturum sonlandırıldı");
            safeResp.put("status", "completed");
            safeResp.put("id", id);
            if (notes != null) safeResp.put("notes", notes);

            String start = realTime(meeting.getStartTimestamp());
            if (start != null) safeResp.put("startAt", start);

            String end = realTime(meeting.getEndTimestamp());
            if (end != null) safeResp.put("endAt", end);
            if (meeting.getVideoOid() != null) safeResp.put("videoOid", meeting.getVideoOid());  // opsiyonel feedback

            return ResponseEntity.ok(safeResp);
        }
    } */

    @PostMapping("/{id}/end")
    public ResponseEntity<Map<String, Object>> endMeeting(
            @PathVariable UUID id,
            @RequestBody(required = false) EndRequest body) {

        String notes = body != null ? body.getNotes() : null;
        String by = (body != null && body.getBy() != null && !body.getBy().isBlank())
                ? body.getBy() : "operator";

        boolean updated = meetingService.endMeeting(id, notes);
        if (!updated) {
            return ResponseEntity.status(404).body(Map.of(
                    "status", "not_found",
                    "message", "Oturum bulunamadı"
            ));
        }

        socketHandler.emitMeetingEndedFromRest(id.toString(), by);

        Meeting meeting = meetingService.getMeetingById(id);

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("message", "Oturum sonlandırıldı");
        resp.put("status", "completed");
        resp.put("id", id);
        if (notes != null) resp.put("notes", notes);
        String start = realTime(meeting.getStartTimestamp());
        if (start != null) resp.put("startAt", start);
        String end = realTime(meeting.getEndTimestamp());
        if (end != null) resp.put("endAt", end);

        return ResponseEntity.ok(resp);
    }

    @GetMapping("/{id}/status")
    public ResponseEntity<MeetingResponse> getStatus(@PathVariable UUID id) {
        Meeting meeting = meetingService.getMeetingById(id);

        if (meeting == null) {
            return ResponseEntity.status(404)
                    .body(MeetingResponse.from(null, "Oturum bulunamadı"));
        }
        return ResponseEntity.ok(MeetingResponse.from(meeting,
                "Oturum durumu: " + meeting.getStatus()));
    }

    @PostMapping(
            value = "/{id}/screenshots/base64",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<ScreenshotResponse> uploadScreenshotBase64(
            @PathVariable UUID id,
            @RequestBody ScreenshotUploadBase64Request body
    ) throws Exception {
        var saved = meetingService.saveScreenshotBase64(
                id,
                body.getDataBase64(),
                body.getContentType(),
                body.getTakenBy(),
                body.getNote()
        );
        return ResponseEntity.ok(ScreenshotResponse.from(saved));
    }


    @PostMapping(value = "/{id}/recordings", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<MeetingRecordResponse> uploadRecording(
            @PathVariable UUID id,
            @RequestParam("file") MultipartFile file,
            @RequestParam(required = false) String takenBy,
            @RequestParam(required = false) String note
    ) throws Exception {
        MeetingRecord saved = meetingService.saveMultipart(id, file, takenBy, note);
        return ResponseEntity.ok(MeetingRecordResponse.from(saved));
    }

}

