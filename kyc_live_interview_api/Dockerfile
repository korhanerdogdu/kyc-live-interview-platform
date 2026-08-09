# Stage 1: Build Spring Boot app
FROM maven:3.9.6-eclipse-temurin-17 AS builder
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -B
COPY src ./src
RUN mvn clean package -DskipTests -B

# Stage 2: Run Spring Boot jar
FROM eclipse-temurin:17-jre-jammy
WORKDIR /app

# Create non-root user
RUN groupadd -r appgroup && useradd -r -g appgroup appuser

COPY --from=builder /app/target/kyc_live_interview_api-0.0.1-SNAPSHOT.jar app.jar
RUN chown appuser:appgroup app.jar

USER appuser
EXPOSE 8080 8000

ENTRYPOINT ["java", "-Djava.security.egd=file:/dev/./urandom", "-Xms512m", "-Xmx1024m", "-jar", "app.jar"]