import { describe, it, expect } from "vitest";
import { roadmapPath, parseRoadmapId } from "./roadmap-path";

describe("roadmapPath", () => {
  it("monta a URL no formato /roadmaps/{id}-{slug}", () => {
    expect(roadmapPath({ id: 12, slug: "roadmap-vps-2026" })).toBe("/roadmaps/12-roadmap-vps-2026");
  });
});

describe("parseRoadmapId", () => {
  it("extrai o id inteiro do início do parâmetro", () => {
    expect(parseRoadmapId("12-roadmap-vps-2026")).toBe(12);
  });
  it("resolve mesmo quando o slug está 'errado' (roteia pelo id)", () => {
    expect(parseRoadmapId("12-slug-totalmente-diferente")).toBe(12);
  });
  it("aceita id puro sem slug", () => {
    expect(parseRoadmapId("7")).toBe(7);
  });
  it("retorna null para entradas inválidas", () => {
    expect(parseRoadmapId(undefined)).toBeNull();
    expect(parseRoadmapId("abc")).toBeNull();
    expect(parseRoadmapId("")).toBeNull();
  });
});
