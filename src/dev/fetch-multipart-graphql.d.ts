declare module "fetch-multipart-graphql" {
  export default function fetchMultipart(
    endpoint: string,
    params: {
      method: RequestInit["method"];
      body: RequestInit["body"];
      headers: RequestInit["headers"];
      onNext: (result: unkown) => void;
      onError: (err: unknown) => void;
      onComplete: () => void;
    }
  );
}
