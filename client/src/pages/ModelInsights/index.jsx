import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { modelApi } from "../../api/client";
import { ErrorState, Loader } from "../../components/ui/Feedback";
import PageHeader from "../../components/ui/PageHeader";
import Tabs from "../../components/ui/Tabs";
import ComparisonTab from "./ComparisonTab";
import ExplainabilityTab from "./ExplainabilityTab";
import OverviewTab from "./OverviewTab";
import PerformanceTab from "./PerformanceTab";
import SimulatorTab from "./SimulatorTab";
import TrainingTab from "./TrainingTab";
import styles from "./ModelInsights.module.css";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "comparison", label: "Model comparison" },
  { id: "performance", label: "XGBoost performance" },
  { id: "explainability", label: "Explainability (SHAP)" },
  { id: "training", label: "Training and tuning" },
  { id: "simulator", label: "What-if simulator" },
];
const SOURCES = ["info", "comparison", "evaluation", "explainability", "training", "public-validation"];

/**
 * Model Insights: everything about the models - the multi-algorithm comparison,
 * every XGBoost metric and visualisation, SHAP explainability and a live simulator.
 */
export default function ModelInsights() {
  const [tab, setTab] = useState("overview");
  const results = useQueries({
    queries: SOURCES.map((name) => ({
      queryKey: ["model", name],
      queryFn: () => (name === "info" ? modelApi.info() : modelApi.report(name)),
      staleTime: 5 * 60 * 1000,
    })),
  });
  const loading = results.some((r) => r.isLoading);
  const failed = results.find((r) => r.isError && r !== results[5]);
  const [info, comparison, evaluation, explainability, training, publicValidation] = results.map((r) => r.data);

  return (
    <>
      <PageHeader title="Model insights"
        subtitle="How the credit model was built, how it compares with other algorithms, and how it reaches each decision." />
      <div className={styles.tabs}>
        <Tabs tabs={TABS} active={tab} onChange={setTab} label="Model insights sections" />
      </div>
      {loading ? <Loader label="Loading model reports" /> : failed ? (
        <ErrorState error={failed.error} onRetry={() => results.forEach((r) => r.refetch())} />
      ) : (
        <div role="tabpanel" aria-labelledby={`tab-${tab}`}>
          {tab === "overview" && <OverviewTab info={info} comparison={comparison} evaluation={evaluation} />}
          {tab === "comparison" && <ComparisonTab comparison={comparison} />}
          {tab === "performance" && <PerformanceTab evaluation={evaluation} />}
          {tab === "explainability" && <ExplainabilityTab explainability={explainability} />}
          {tab === "training" && <TrainingTab training={training} info={info} publicValidation={publicValidation} />}
          {tab === "simulator" && <SimulatorTab />}
        </div>
      )}
    </>
  );
}
