export const homeFor = (user) => (user?.role === "applicant" ? "/my-applications" : "/dashboard");
