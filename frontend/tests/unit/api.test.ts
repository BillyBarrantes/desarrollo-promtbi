import { describe, expect, it } from "vitest";

import { parseRejection } from "../../lib/api";

describe("parseRejection", () => {
  it("devuelve null para payloads inválidos", () => {
    expect(parseRejection(null)).toBeNull();
    expect(parseRejection("error")).toBeNull();
    expect(parseRejection({})).toBeNull();
    expect(parseRejection({ detail: "mensaje plano" })).toBeNull();
  });

  it("devuelve null cuando falta información obligatoria", () => {
    expect(
      parseRejection({
        detail: {
          message: "No cumple",
          validacion_RNE: {},
        },
      }),
    ).toBeNull();
  });

  it("extrae un rechazo válido", () => {
    const rejection = {
      message: "El layout no cumple las reglas RNE",
      validacion_RNE: { estadoglobal: "rechazado" },
      alternativas: ["Revisar la distribución"],
    };

    expect(parseRejection({ detail: rejection })).toEqual(rejection);
  });
});
