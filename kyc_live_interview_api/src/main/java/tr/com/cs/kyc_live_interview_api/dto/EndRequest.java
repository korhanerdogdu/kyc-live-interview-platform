package tr.com.cs.kyc_live_interview_api.dto;

public class EndRequest {
    private String notes;
    private String by; // "customer" | "operator" (optional)
    private String videoBase64;
    private String videoContentType;// yeni

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }

    public String getBy() { return by; }
    public void setBy(String by) { this.by = by; }
    public String getVideoBase64() { return videoBase64; }
    public void setVideoBase64(String videoBase64) { this.videoBase64 = videoBase64; }

    public String getVideoContentType() { return videoContentType; }
    public void setVideoContentType(String videoContentType) { this.videoContentType = videoContentType; }
}