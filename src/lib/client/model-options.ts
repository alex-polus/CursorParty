import type { ModelDTO, ModelParamDTO, ModelParameterDTO } from "../types";

const COMPOSER_PARAMETER_IDS = new Set([
  "thinking",
  "reasoning",
  "effort",
  "fast",
]);

export function composerParameters(model: ModelDTO | undefined) {
  return (model?.parameters ?? []).filter((parameter) =>
    COMPOSER_PARAMETER_IDS.has(parameter.id),
  );
}

export function defaultModelParams(model: ModelDTO | undefined): ModelParamDTO[] {
  return model?.defaultParams.map((param) => ({ ...param })) ?? [];
}

export function modelParamValue(
  params: ModelParamDTO[],
  parameter: ModelParameterDTO,
) {
  return (
    params.find((param) => param.id === parameter.id)?.value ??
    parameter.values[0]?.value ??
    ""
  );
}

export function selectModelParam(
  model: ModelDTO | undefined,
  params: ModelParamDTO[],
  id: string,
  value: string,
): ModelParamDTO[] {
  const requested = new Map(
    composerParameters(model).map((parameter) => [
      parameter.id,
      parameter.id === id ? value : modelParamValue(params, parameter),
    ]),
  );
  const matchingVariant = model?.variants.find((variant) =>
    [...requested].every(
      ([parameterId, parameterValue]) =>
        variant.find((param) => param.id === parameterId)?.value ===
        parameterValue,
    ),
  );
  if (matchingVariant) return matchingVariant.map((param) => ({ ...param }));

  const next = params.filter((param) => param.id !== id);
  return [...next, { id, value }];
}
