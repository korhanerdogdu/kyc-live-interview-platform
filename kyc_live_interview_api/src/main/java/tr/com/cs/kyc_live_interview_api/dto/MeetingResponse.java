package tr.com.cs.kyc_live_interview_api.dto;

import tr.com.cs.kyc_live_interview_api.model.Meeting;
import java.util.UUID;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonProperty;



public class MeetingResponse {
    private UUID id;
    private String operatorId;
    private String customerId;
    private String status;
    private String message;



    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd HH:mm:ss", timezone = "Europe/Istanbul")
    private Instant startAt;

    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd HH:mm:ss", timezone = "Europe/Istanbul")
    private Instant endAt;

    public static MeetingResponse from(Meeting meeting) {
        MeetingResponse response = new MeetingResponse();
        if (meeting != null) {
            response.setId(meeting.getId());
            response.setOperatorId(meeting.getOperatorId());
            response.setCustomerId(meeting.getCustomerId());
            response.setStatus(meeting.getStatus());
            response.startAt = meeting.getStartTimestamp();
            response.endAt = meeting.getEndTimestamp();
        }
        return response;
    }

    public static MeetingResponse from(Meeting meeting, String message) {
        MeetingResponse response = from(meeting);
        response.setMessage(message);
        return response;
    }
    private static final ZoneId TR = ZoneId.of("Europe/Istanbul");
    private static final DateTimeFormatter TR_FMT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(TR);


    public UUID getId() {
        return id;
    }
    public void setId(UUID id) {
        this.id = id;
    }
    public String getOperatorId() {
        return operatorId;
    }
    public void setOperatorId(String operatorId) {
        this.operatorId = operatorId;
    }
    public String getCustomerId() {
        return customerId;
    }
    public void setCustomerId(String customerId) {
        this.customerId = customerId;
    }
    public String getStatus() {
        return status;
    }
    public void setStatus(String status) {
        this.status = status;
    }
    public Instant getStartAt() {
        return startAt;
    }
    public void setStartAt(Instant startAt) {
        this.startAt = startAt;
    }
    public Instant getEndAt() {
        return endAt;
    }
    public void setEndAt(Instant endAt) {
        this.endAt = endAt;
    }
    public String getMessage() {
        return message;
    }
    public void setMessage(String message) {
        this.message = message;
    }
}
