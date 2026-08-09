package tr.com.cs.kyc_live_interview_api.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.GenericGenerator;


@Entity
public class Meeting {

    @Id
    @GeneratedValue(generator = "UUID")
    @GenericGenerator(name = "UUID", strategy = "org.hibernate.id.UUIDGenerator")
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;


    private String operatorId;
    private String customerId;
    private String status;
    private String notes;
    private String screenshotUrl;

    @Column(name = "start_timestamp", columnDefinition = "TIMESTAMP(0) WITH TIME ZONE")
    private Instant startTimestamp;

    @Column(name = "end_timestamp", columnDefinition = "TIMESTAMP(0) WITH TIME ZONE")
    private Instant endTimestamp;


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
    public Instant getStartTimestamp() { return startTimestamp; }
    public void setStartTimestamp(Instant startTimestamp) { this.startTimestamp = startTimestamp; }
    public Instant getEndTimestamp() { return endTimestamp; }
    public void setEndTimestamp(Instant endTimestamp) { this.endTimestamp = endTimestamp; }
    public String getNotes() {
        return notes;
    }
    public void setNotes(String notes) {
        this.notes = notes;
    }
    public String getScreenshotUrl() {
        return screenshotUrl;
    }
    public void setScreenshotUrl(String screenshotUrl) {
        this.screenshotUrl = screenshotUrl;
    }

}