// tr/com/cs/kyc_live_interview_api/model/Screenshot.java
package tr.com.cs.kyc_live_interview_api.model;

import jakarta.persistence.*;
import org.hibernate.annotations.UuidGenerator;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "screenshot")
public class Screenshot {

    @Id @GeneratedValue @UuidGenerator
    private UUID id;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "meeting_id", nullable = false)
    private Meeting meeting;


    @Column(name = "data_base64", nullable = false, columnDefinition = "text")
    private String dataBase64;
    @Column(name = "data_oid")   // column type: oid
    private Long dataOid;

    @Column(name = "content_type", length = 100, nullable = false)
    private String contentType;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    @Column(name = "taken_at", nullable = false)
    private Instant takenAt;

    @Column(name = "taken_by", length = 64)
    private String takenBy;

    @Column(name = "note", length = 500)
    private String note;

    @PrePersist
    void onCreate() { if (takenAt == null) takenAt = Instant.now(); }

    // getters/setters
    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public Meeting getMeeting() { return meeting; }
    public void setMeeting(Meeting meeting) { this.meeting = meeting; }
    public String getDataBase64() { return dataBase64; }
    public void setDataBase64(String dataBase64) { this.dataBase64 = dataBase64; }
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
}
