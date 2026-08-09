package tr.com.cs.kyc_live_interview_api.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import tr.com.cs.kyc_live_interview_api.model.Meeting;

import java.util.List;
import java.util.UUID;


public interface MeetingRepository extends JpaRepository<Meeting, UUID> {
    List<Meeting> findByStatus(String status);
}

