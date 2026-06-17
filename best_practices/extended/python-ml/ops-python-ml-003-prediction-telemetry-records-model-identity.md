---
id: ops-python-ml-003
title: Prediction telemetry records model identity
domain: ops
language: python-ml
app-type: [http-service, batch-job]
status: active
sources:
  - type: article
    title: "The ML Test Score: A Rubric for ML Production Readiness"
---

# ops-python-ml-003: Prediction telemetry records model identity

## Intent
Make model-serving regressions diagnosable by recording which model produced each production prediction.

## Applicability
Applies when the diff adds or changes online inference, batch scoring, or production prediction event publishing.

## What to inspect
Prediction handlers, logging, event schemas, request or entity IDs, and model version fields.

## Pass criteria
Prediction telemetry includes a stable request or entity identifier and the model version or artifact identifier used for that prediction.

## Fail criteria
The changed prediction path emits no telemetry, or logs predictions without the model identity needed to trace behavior later.

## Do not flag
Local experiments or systems that avoid raw feature logging for privacy reasons but still record request and model identity safely.

## Confidence guidance
`HIGH` when the inference path clearly includes or omits model identity. `MEDIUM` when logging is routed through shared helpers. `LOW` when production use is unclear.

## Remediation
Emit structured prediction telemetry with request or entity identity and model version.

## Pass example
```python
logger.info("prediction_made", extra={
    "request_id": request_id,
    "model_version": MODEL_VERSION,
})
```

## Fail example
```python
def predict(features):
    return model.predict_proba(features)[0, 1]
```
