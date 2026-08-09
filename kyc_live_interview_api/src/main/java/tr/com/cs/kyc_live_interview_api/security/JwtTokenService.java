package tr.com.cs.kyc_live_interview_api.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * DEV implementation:
 * - Treats the configured secret as the token itself (simple equality check).
 * - For production, replace isValid/subject/role with real JWT verification.
 */
@Service
public class JwtTokenService {

    // Reads from application.properties (jwt.secret) or falls back to env JWT_SECRET
    @Value("${jwt.secret:${JWT_SECRET:}}")
    private String configuredSecret;

    public boolean isValid(String token) {
        if (token == null || token.isBlank()) return false;
        // DEV mode: accept when token equals the configured secret string
        return token.equals(configuredSecret);
    }

    public String subject(String token) {
        // DEV mode: fixed subject; in real JWT, parse "sub" claim
        return "api-user";
    }

    public String role(String token) {
        // DEV mode: fixed role; in real JWT, parse roles/claims
        return "OPERATOR";
    }
}
