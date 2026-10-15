from pydantic import BaseModel, ConfigDict


class ApiModel(BaseModel):
    """Base for every response model: fields with defaults are always serialised, so the
    OpenAPI schema marks them required (the generated TS types are then non-optional)."""

    model_config = ConfigDict(json_schema_serialization_defaults_required=True)
