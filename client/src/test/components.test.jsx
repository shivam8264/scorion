import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import CreditScoreScale from "../components/CreditScoreScale";
import FairnessMetricCard from "../components/FairnessMetricCard";
import FactorList from "../components/FactorList";
import StatusBadge from "../components/StatusBadge";
import Tabs from "../components/ui/Tabs";
import { formatINR, formatPct } from "../utils/format";

describe("StatusBadge", () => {
  test("labels decisions in plain language", () => {
    render(<StatusBadge value="refer" />);
    expect(screen.getByText("Refer to officer")).toBeInTheDocument();
  });
});

describe("CreditScoreScale", () => {
  test("shows the score, verdict and default probability", () => {
    render(<CreditScoreScale score={712} riskScore={0.12} decision="approve" thresholds={{ refer_above: 0.3, decline_above: 0.6 }} />);
    expect(screen.getByText("712")).toBeInTheDocument();
    expect(screen.getByText("Likely approved")).toBeInTheDocument();
    expect(screen.getByText(/12.0% estimated chance of default/)).toBeInTheDocument();
    // band boundaries derived from thresholds with the same scaling as the ML service
    expect(screen.getByText("661")).toBeInTheDocument();
    expect(screen.getByText("571")).toBeInTheDocument();
  });
});

describe("FairnessMetricCard", () => {
  test("passes when a gap is within its limit", () => {
    render(<FairnessMetricCard title="Parity" value={0.04} threshold={0.1} description="d" />);
    expect(screen.getByText("Within limit")).toBeInTheDocument();
  });
  test("flags a ratio below the four-fifths rule", () => {
    render(<FairnessMetricCard title="Ratio" value={0.7} threshold={0.8} direction="higher" description="d" />);
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
  });
  test("handles missing values", () => {
    render(<FairnessMetricCard title="Odds" value={null} threshold={0.1} description="d" />);
    expect(screen.getByText("Not enough data")).toBeInTheDocument();
  });
});

describe("FactorList", () => {
  test("renders the plain-language reasons", () => {
    render(<FactorList title="Raised the risk" tone="up"
      factors={[{ feature: "debt_to_income", label: "Debt-to-income ratio", shap: 0.5, value: 0.9, reason: "Your existing debt is high." }]} />);
    expect(screen.getByText("Your existing debt is high.")).toBeInTheDocument();
  });
});

describe("Tabs", () => {
  test("supports arrow-key navigation", async () => {
    const onChange = vi.fn();
    render(<Tabs tabs={[{ id: "a", label: "A" }, { id: "b", label: "B" }]} active="a" onChange={onChange} />);
    screen.getByRole("tab", { name: "A" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("b");
  });
});

describe("formatters", () => {
  test("format INR and percentages", () => {
    expect(formatINR(150000)).toBe("₹1,50,000");
    expect(formatPct(0.1234)).toBe("12.3%");
  });
});
