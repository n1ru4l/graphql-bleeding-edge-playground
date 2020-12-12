import React from "react";
import parser from "http-string-parser";
import "./App.css";

function App() {
  const data = useDeferQuery();

  return (
    <div className="App">
      <header className="App-header">
        <pre>
          <code>{JSON.stringify(data, null, 2)}</code>
        </pre>
      </header>
    </div>
  );
}

function useDeferQuery() {
  const [response, setResponse] = React.useState<any>();

  React.useEffect(() => {
    fetch("http://localhost:4000/graphql", {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `query DeferTestQuery {
  deferTest {
    name
    ... on GraphQLDeferTest @defer {
      deferThisField
    }
  }
}`,
      }),
    }).then((res) => {
      const reader = res.body?.getReader();
      // https://developer.mozilla.org/ja/docs/Web/API/Streams_API/Using_readable_streams
      return new ReadableStream({
        start(controller) {
          return pump();
          function pump(): any {
            return reader?.read().then(({ done, value }) => {
              // データを消費する必要がなくなったら、ストリームを閉じます
              if (done) {
                controller.close();
                return;
              }
              // uint8arrayを文字列に変換する
              const str = new TextDecoder("utf-8").decode(value);
              // 文字列形式のHTTPレスポンスをパースする
              const resBody = parser.parseResponse(str).body;
              // bodyが2行の文字列で、1行目にJSON、2行目に区切りの---が付いているので1行目を取り出す
              const body = resBody.split("\n")[0];
              const queryRes = JSON.parse(body);

              // deferディレクティブを使ったレスポンスの最初はpathがなく、後続のものはpathが付いている
              if (queryRes.path) {
                setResponse((prev: any) => ({ ...prev, ...queryRes.data }));
              } else {
                setResponse({ ...queryRes.data.deferTest });
              }
              return pump();
            });
          }
        },
      });
    });
  }, []);

  return response;
}

export default App;
