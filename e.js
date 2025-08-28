// Canvas Students Exporter with upload + progress overlay
(async () => {
  // --- Ask for filename ---
  let fname = prompt("Enter CSV filename (e.g. Finance 1):", "Finance 1") || "students";
  fname = fname.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");

  const endpoint = "/api/graphql";
  const headers = {
    "content-type": "application/json",
    "x-csrf-token": decodeURIComponent(document.cookie.match(/_csrf_token=([^;]+)/)[1])
  };

  const userID = String(ENV.current_user_id);
  let afterUser = null, afterContext = null;
  let students = [], courseName = "";
  let page = 1;

  // --- UI Overlay ---
  const overlay = document.createElement("div");
  overlay.innerHTML = `
    <div id="exportProgress" style="
      position:fixed; bottom:20px; right:20px; width:340px;
      background:#1e293b; color:white; font-family:sans-serif;
      border-radius:12px; box-shadow:0 4px 12px rgba(0,0,0,0.3);
      padding:16px; z-index:99999; font-size:14px;">
      <div style="font-weight:600; margin-bottom:8px;">📤 Exporting Students</div>
      <div style="height:8px; background:#334155; border-radius:6px; overflow:hidden;">
        <div id="progressBar" style="height:100%; width:0%; background:#3b82f6; transition:width 0.3s;"></div>
      </div>
      <div id="progressText" style="margin-top:8px;">0 students fetched • 00:00</div>
    </div>
  `;
  document.body.appendChild(overlay);

  const progressBar = document.getElementById("progressBar");
  const progressText = document.getElementById("progressText");
  const startTime = Date.now();

  function updateProgress(current, totalGuess = null, message = null) {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const ss = String(elapsed % 60).padStart(2, "0");
    const pct = totalGuess ? Math.min(100, (current / totalGuess) * 100) : 0;

    progressBar.style.width = pct + "%";
    progressText.textContent = message || `${current} students fetched • ${mm}:${ss}`;
  }

  console.log("⏳ Fetching students for user:", userID);

  while (true) {
    const body = {
      operationName: "GetAddressBookRecipients",
      variables: { search: "", userID, courseContextCode: "", afterUser, afterContext },
      query: `query GetAddressBookRecipients($userID: ID!, $context: String, $search: String, $afterUser: String, $afterContext: String, $courseContextCode: String!) {
        legacyNode(_id: $userID, type: User) {
          ... on User {
            recipients(context: $context, search: $search) {
              contextsConnection(first: 1, after: $afterContext) {
                nodes { id name userCount }
                pageInfo { endCursor hasNextPage }
              }
              usersConnection(first: 50, after: $afterUser) {
                nodes {
                  _id
                  id
                  name
                  shortName
                  observerEnrollmentsConnection(contextCode: $courseContextCode) { nodes { __typename } }
                }
                pageInfo { endCursor hasNextPage }
              }
            }
          }
        }
      }`
    };

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      credentials: "same-origin"
    });
    const data = await res.json();
    const rec = data?.data?.legacyNode?.recipients;
    if (!rec) break;

    if (!courseName && rec.contextsConnection?.nodes?.length) {
      courseName = rec.contextsConnection.nodes[0].name;
      console.log("📚 Course:", courseName);
    }

    students.push(...rec.usersConnection.nodes);

    const totalGuess = rec.contextsConnection?.nodes?.[0]?.userCount || null;
    updateProgress(students.length, totalGuess);

    console.log(`📥 Page ${page++}: +${rec.usersConnection.nodes.length} students (total ${students.length})`);

    if (!rec.usersConnection.pageInfo.hasNextPage) break;
    afterUser = rec.usersConnection.pageInfo.endCursor;
  }

  // Deduplicate by ID
  const seen = new Set();
  const unique = students.filter(s => !seen.has(s._id) && seen.add(s._id));

  console.log(`✅ Finished. Unique students: ${unique.length}`);

  // Build CSV
  let csv = "Course,Name,ShortName\n" +
    unique.map(s => `"${courseName}","${s.name}","${s.shortName}"`).join("\n");

  // --- Upload first ---
  try {
    updateProgress(unique.length, unique.length, "⬆️ Uploading CSV...");
    const uploadRes = await fetch(`https://api.qistudy.com/v1/manage/file/upload_csv/qWi0f?name=${fname}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: csv
    });

    if (!uploadRes.ok) throw new Error("Upload failed: " + uploadRes.status);
    updateProgress(unique.length, unique.length, `✅ Uploaded as ${fname}.csv`);
    console.log("✅ Upload success");
  } catch (err) {
    updateProgress(unique.length, unique.length, `❌ Upload failed: ${err.message}`);
    console.error(err);
  }

  // --- Download locally as backup ---
  let blob = new Blob([csv], {type: "text/csv"});
  let a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fname + ".csv";
  a.click();
})();
