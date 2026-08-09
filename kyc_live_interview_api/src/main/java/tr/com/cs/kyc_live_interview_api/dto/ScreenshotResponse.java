package tr.com.cs.kyc_live_interview_api.dto;

import tr.com.cs.kyc_live_interview_api.model.Screenshot;

import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

public class ScreenshotResponse {
    private UUID id;
    private UUID meetingId;
    private String contentType;
    private long sizeBytes;
    private Instant takenAt;
    private String takenBy;
    private String note;

    private String dataBase64;

    public static ScreenshotResponse from(Screenshot s) {
        ScreenshotResponse r = new ScreenshotResponse();
        r.setId(s.getId());
        r.setMeetingId(s.getMeeting().getId());
        r.setContentType(s.getContentType());
        r.setSizeBytes(s.getSizeBytes());
        r.setTakenAt(s.getTakenAt());
        r.setTakenBy(s.getTakenBy());
        r.setNote(s.getNote());
        r.setDataBase64(s.getDataBase64()); // <-- direkt string
        return r;
    }


    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getMeetingId() { return meetingId; }
    public void setMeetingId(UUID meetingId) { this.meetingId = meetingId; }
    public String getContentType() { return contentType; }
    public void setContentType(String contentType) { this.contentType = contentType; }
    public long getSizeBytes() { return sizeBytes; }
    public void setSizeBytes(long sizeBytes) { this.sizeBytes = sizeBytes; }
    public Instant getTakenAt() { return takenAt; }
    public void setTakenAt(Instant takenAt) { this.takenAt = takenAt; }
    public String getTakenBy() { return takenBy; }
    public void setTakenBy(String takenBy) { this.takenBy = takenBy; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
    public String getDataBase64() { return dataBase64; }
    public void setDataBase64(String dataBase64) { this.dataBase64 = dataBase64; }
}
