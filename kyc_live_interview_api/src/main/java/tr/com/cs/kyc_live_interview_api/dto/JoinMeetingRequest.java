package tr.com.cs.kyc_live_interview_api.dto;

public class JoinMeetingRequest {
    private String userId;
    private Boolean microphoneEnabled;
    private Boolean cameraEnabled;
    private DeviceInfo device;

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public Boolean getMicrophoneEnabled() {
        return microphoneEnabled;
    }

    public void setMicrophoneEnabled(Boolean microphoneEnabled) {
        this.microphoneEnabled = microphoneEnabled;
    }

    public Boolean getCameraEnabled() {
        return cameraEnabled;
    }

    public void setCameraEnabled(Boolean cameraEnabled) {
        this.cameraEnabled = cameraEnabled;
    }

    public DeviceInfo getDevice() {
        return device;
    }

    public void setDevice(DeviceInfo device) {
        this.device = device;
    }

    public static class DeviceInfo {
        private String os;
        private String browser;
        private String platform;

        public String getOs() {
            return os;
        }

        public void setOs(String os) {
            this.os = os;
        }

        public String getBrowser() {
            return browser;
        }

        public void setBrowser(String browser) {
            this.browser = browser;
        }

        public String getPlatform() {
            return platform;
        }

        public void setPlatform(String platform) {
            this.platform = platform;
        }
    }
}
