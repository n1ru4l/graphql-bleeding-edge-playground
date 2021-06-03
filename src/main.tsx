import React from "react";
import ReactDOM from "react-dom";
import "./index.css";
import App from "./App";

if (import.meta.env.DEV && window.location.pathname === "/__dev__/graphiql") {
  import("./dev/GraphiQL").then(({ GraphiQL }) => {
    ReactDOM.render(
      <React.StrictMode>
        <GraphiQL />
      </React.StrictMode>,
      document.getElementById("root")
    );
  });
} else {
  ReactDOM.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
    document.getElementById("root")
  );
}
