package tr.com.cs.kyc_live_interview_api.dto;

import tr.com.cs.kyc_live_interview_api.model.MeetingRecord;

import java.time.Instant;
import java.util.UUID;

public class MeetingRecordResponse {
    private UUID id;
    private UUID meetingId;
    private String contentType;
    private long sizeBytes;
    private Instant recordedAt;
    private String takenBy;
    private String note;

    public static MeetingRecordResponse from(MeetingRecord r) {
        MeetingRecordResponse dto = new MeetingRecordResponse();
        dto.id = r.getId();
        dto.meetingId = r.getMeeting().getId();
        dto.contentType = r.getContentType();
        dto.sizeBytes = r.getSizeBytes();
        dto.recordedAt = r.getRecordedAt();
        dto.takenBy = r.getTakenBy();
        dto.note = r.getNote();
        return dto;
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getMeetingId() { return meetingId; }
    public void setMeetingId(UUID meetingId) { this.meetingId = meetingId; }
    public String getContentType() { return contentType; }
    public void setContentType(String contentType) { this.contentType = contentType; }
    public long getSizeBytes() { return sizeBytes; }
    public void setSizeBytes(long sizeBytes) { this.sizeBytes = sizeBytes; }
    public Instant getRecordedAt() { return recordedAt; }
    public void setRecordedAt(Instant recordedAt) { this.recordedAt = recordedAt; }
    public String getTakenBy() { return takenBy; }
    public void setTakenBy(String takenBy) { this.takenBy = takenBy; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
}
