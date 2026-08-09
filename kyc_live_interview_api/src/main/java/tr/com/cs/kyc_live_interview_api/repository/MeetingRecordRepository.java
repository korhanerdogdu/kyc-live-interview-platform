package tr.com.cs.kyc_live_interview_api.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import tr.com.cs.kyc_live_interview_api.model.MeetingRecord;

import java.util.List;
import java.util.UUID;

public interface MeetingRecordRepository extends JpaRepository<MeetingRecord, UUID> {
   // List<MeetingRecord> findByMeeting_IdOrderByRecordedAtAsc(UUID meetingId);
}
