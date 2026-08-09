package tr.com.cs.kyc_live_interview_api.model;

import jakarta.persistence.*;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "meeting_record")
public class MeetingRecord {

    @Id @GeneratedValue @UuidGenerator
    private UUID id;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "meeting_id", nullable = false)
    private Meeting meeting;

    @Lob
    @JdbcTypeCode(SqlTypes.BINARY)
    @Column(name = "data", nullable = false)
    private byte[] data;

    @Column(name = "content_type", length = 100, nullable = false)
    private String contentType;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    @Column(name = "recorded_at", nullable = false)
    private Instant recordedAt;

    @Column(name = "taken_by", length = 64)
    private String takenBy;

    @Column(name = "note", length = 500)
    private String note;

    @PrePersist
    void onCreate() {
        if (recordedAt == null) recordedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public Meeting getMeeting() { return meeting; }
    public void setMeeting(Meeting meeting) { this.meeting = meeting; }
    public byte[] getData() { return data; }
    public void setData(byte[] data) { this.data = data; }
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
