package tr.com.cs.kyc_live_interview_api.dto;

public class ScreenshotUploadBase64Request {
    private String dataBase64;
    private String contentType;
    private String takenBy;
    private String note;


    public String getDataBase64() { return dataBase64; }
    public void setDataBase64(String dataBase64) { this.dataBase64 = dataBase64; }
    public String getContentType() { return contentType; }
    public void setContentType(String contentType) { this.contentType = contentType; }
    public String getTakenBy() { return takenBy; }
    public void setTakenBy(String takenBy) { this.takenBy = takenBy; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
}
