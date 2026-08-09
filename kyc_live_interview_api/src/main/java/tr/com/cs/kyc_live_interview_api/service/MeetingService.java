package tr.com.cs.kyc_live_interview_api.service;

import org.springframework.stereotype.Service;
import tr.com.cs.kyc_live_interview_api.model.Meeting;
import tr.com.cs.kyc_live_interview_api.dto.MeetingRequest;
import tr.com.cs.kyc_live_interview_api.repository.MeetingRepository;
import tr.com.cs.kyc_live_interview_api.dto.EndRequest;
import org.springframework.web.multipart.MultipartFile;
import tr.com.cs.kyc_live_interview_api.model.Screenshot;
import tr.com.cs.kyc_live_interview_api.repository.ScreenshotRepository;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import org.springframework.jdbc.core.JdbcTemplate;
import tr.com.cs.kyc_live_interview_api.dto.ScreenshotResponse;
import tr.com.cs.kyc_live_interview_api.model.MeetingRecord;
import tr.com.cs.kyc_live_interview_api.dto.MeetingRecordResponse;
import tr.com.cs.kyc_live_interview_api.repository.MeetingRecordRepository;

import java.time.Instant;
import org.springframework.transaction.annotation.Transactional;

import org.springframework.jdbc.datasource.DataSourceUtils;
import org.springframework.stereotype.Service;
import javax.sql.DataSource;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Collections;
import java.sql.Connection;
import java.util.UUID;
import java.util.Base64;


@Service
public class MeetingService {

    private final MeetingRepository meetingRepository;
    private final ScreenshotRepository screenshotRepository;
    private final MeetingRecordRepository meetingRecordRepository;
    private final JdbcTemplate jdbcTemplate;


    public MeetingService(MeetingRepository meetingRepository,
                          ScreenshotRepository screenshotRepository,
                          javax.sql.DataSource dataSource,
                          MeetingRecordRepository meetingRecordRepository) {
        this.meetingRepository = meetingRepository;
        this.screenshotRepository = screenshotRepository;
        this.meetingRecordRepository = meetingRecordRepository;
        this.jdbcTemplate = new JdbcTemplate(dataSource);
    }

    public Meeting startMeeting(MeetingRequest request) {
        Meeting meeting = new Meeting();
        meeting.setCustomerId(request.getCustomerId());
        meeting.setOperatorId(null);
        meeting.setStatus("waiting");
        meeting.setStartTimestamp(Instant.now().truncatedTo(ChronoUnit.SECONDS));

        Meeting saved = meetingRepository.save(meeting);
        System.out.println("Meeting created by customer with ID: " + saved.getId());
        return saved;
    }

    public Meeting getMeetingById(UUID id) {
        return meetingRepository.findById(id).orElse(null);
    }

    public void updateMeetingStatus(UUID id, String status) {
        Meeting meeting = meetingRepository.findById(id).orElse(null);
        if (meeting != null) {
            meeting.setStatus(status);
            if ("completed".equals(status) || "cancelled".equals(status)) {
                meeting.setEndTimestamp(Instant.now().truncatedTo(ChronoUnit.SECONDS));
            }
            meetingRepository.save(meeting);
        }
    }

    public List<Meeting> getPendingMeetings() {
        List<Meeting> meetings = meetingRepository.findByStatus("waiting");
        return meetings != null ? meetings : Collections.emptyList();
    }

    public Meeting joinMeeting(UUID id, String userId) {
        Meeting meeting = meetingRepository.findById(id).orElse(null);
        if (meeting != null && "waiting".equals(meeting.getStatus())) {
            meeting.setOperatorId(userId);
            meeting.setStatus("in_progress");
            if (meeting.getStartTimestamp() == null) {
                meeting.setStartTimestamp(Instant.now().truncatedTo(ChronoUnit.SECONDS));
            }
            return meetingRepository.save(meeting);
        }
        return null;
    }


    public boolean endMeeting(UUID id, String notes) {
        Meeting meeting = meetingRepository.findById(id).orElse(null);
        if (meeting == null) return false;

        if (notes != null && !notes.isBlank()) {
            meeting.setNotes(notes);
        }

        if (!"completed".equals(meeting.getStatus())) {
            meeting.setStatus("completed");
            meeting.setEndTimestamp(Instant.now().truncatedTo(ChronoUnit.SECONDS));
        }

        meetingRepository.save(meeting);
        return true;
    }

    public String getMeetingStatus(UUID id) {
        Meeting meeting = meetingRepository.findById(id).orElse(null);
        return meeting != null ? meeting.getStatus() : "not_found";
    }

    public List<Screenshot> listScreenshots(UUID meetingId) {
        return screenshotRepository.findByMeeting_IdOrderByTakenAtAsc(meetingId);
    }

    public Screenshot getScreenshot(UUID screenshotId) {
        return screenshotRepository.findById(screenshotId).orElse(null);
    }
    private static String stripDataUrlPrefix(String base64) {
        if (base64 == null) return null;
        int idx = base64.indexOf("base64,");
        return (idx >= 0) ? base64.substring(idx + "base64,".length()) : base64;
    }

    public Screenshot saveScreenshotBase64(
            UUID meetingId,
            String dataBase64,
            String contentType,
            String takenBy,
            String note
    ) throws Exception {
        var m = getMeetingById(meetingId);
        if (m == null) {
            throw new IllegalArgumentException("Meeting not found: " + meetingId);
        }

        String clean = stripDataUrlPrefix(dataBase64);
        byte[] bytes = Base64.getDecoder().decode(clean);

        Screenshot s = new Screenshot();
        s.setMeeting(m);
        s.setContentType(contentType != null ? contentType : "application/octet-stream");
        s.setTakenBy(takenBy);
        s.setNote(note);
        s.setTakenAt(Instant.now());
        s.setSizeBytes(bytes.length);
        s.setDataBase64(clean);

        return screenshotRepository.save(s);
    }

    public MeetingRecord saveMultipart(UUID meetingId,
                                       MultipartFile file,
                                       String takenBy,
                                       String note) throws Exception {

        Meeting m = meetingRepository.findById(meetingId)
                .orElseThrow(() -> new IllegalArgumentException("Meeting not found: " + meetingId));

        byte[] bytes = file.getBytes();

        MeetingRecord r = new MeetingRecord();
        r.setMeeting(m);
        r.setData(bytes);
        r.setContentType(file.getContentType() != null ? file.getContentType() : "application/octet-stream");
        r.setSizeBytes(bytes.length);
        r.setRecordedAt(Instant.now());
        r.setTakenBy(takenBy);
        r.setNote(note);

        return meetingRecordRepository.save(r);
    }

}






