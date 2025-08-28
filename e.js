// Canvas Students Exporter
// Usage: paste this into the Chrome console while inside Canvas (Conversations → Address Book)

(async () => {
  const endpoint = "/api/graphql";
  const headers = {
    "content-type": "application/json",
    "x-csrf-token": decodeURIComponent(document.cookie.match(/_csrf_token=([^;]+)/)[1])
  };

  const userID = String(ENV.current_user_id);
  let afterUser = null, afterContext = null;
  let students = [], courseName = "";
  let page = 1;

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
                nodes { id name }
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
    console.log(`📥 Page ${page++}: +${rec.usersConnection.nodes.length} students (total ${students.length})`);

    if (!rec.usersConnection.pageInfo.hasNextPage) break;
    afterUser = rec.usersConnection.pageInfo.endCursor;
  }

  const seen = new Set();
  const unique = students.filter(s => !seen.has(s._id) && seen.add(s._id));

  console.log(`✅ Finished. Unique students: ${unique.length}`);

  let csv = "Course,Name,ShortName\n" +
    unique.map(s => `"${courseName}","${s.name}","${s.shortName}"`).join("\n");

  let blob = new Blob([csv], {type: "text/csv"});
  let a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "students.csv";
  a.click();
})();
