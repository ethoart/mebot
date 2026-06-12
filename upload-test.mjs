import fs from "fs";
import fetch from "node-fetch";
import FormData from "form-data";

async function run() {
  const form = new FormData();
  form.append("screenshots", fs.createReadStream("package.json"));
  const res = await fetch("http://localhost:3000/api/whatsapp/train", {
    method: "POST",
    body: form
  });
  console.log(res.status);
  console.log(await res.text());
}
run();
