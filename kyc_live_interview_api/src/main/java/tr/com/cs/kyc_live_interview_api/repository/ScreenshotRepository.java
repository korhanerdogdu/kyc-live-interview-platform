package tr.com.cs.kyc_live_interview_api.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import tr.com.cs.kyc_live_interview_api.model.Screenshot;

import java.util.List;
import java.util.UUID;

public interface ScreenshotRepository extends JpaRepository<Screenshot, UUID> {
    List<Screenshot> findByMeeting_IdOrderByTakenAtAsc(UUID meetingId);
}
