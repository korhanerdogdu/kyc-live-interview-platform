package tr.com.cs.kyc_live_interview_api.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String,Object>> handleAny(Exception ex){
        ex.printStackTrace();
        return ResponseEntity.status(500).body(Map.of(
                "status", 500,
                "error", "Internal Server Error",
                "message", ex.getMessage()
        ));
    }
}
