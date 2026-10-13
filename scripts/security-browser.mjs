// Security cases extend the existing isolated browser run; no live credentials.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";
import {
  SECTION_A_CRITERIA,
  SECTION_B_CRITERIA,
  recomputeScores,
} from "../netlify/functions/rubric.js";
export async function verifySecurity({
  page,
  context,
  browser,
  dev,
  qa,
  check,
  write,
  records,
  users,
  vendors,
  login,
  overview,
  delay,
  secret,
  passwordHash,
  sandbox,
}) {
  const evidence = [];
  const snapshots = new Map(
    [
      "evaluations",
      "assessment_versions",
      "vendors",
      "users",
      "assessment_risk",
    ].map((name) => [
      name,
      fs.readFileSync(path.join(sandbox, ".data", name + ".json")),
    ]),
  );
  const tokenFor = (role) =>
    jwt.sign(
      role === "vendor"
        ? {
            role,
            vendorId: "phasea-vendor",
            email: "vendor@phasea.test",
            linkedRegistrationIds: records.map((r) => r._id),
          }
        : {
            role,
            userId: "phasea-" + role,
            name: "Phase A " + role,
            email: role + "@phasea.test",
            assessorId: role === "assessor" ? "PAA 001" : undefined,
          },
      secret,
      { expiresIn: "1h" },
    );
  const routes = {
    react: {
      manager: "/react/manager.html",
      assessor: "/react/assessor.html",
      vendor: "/react/vendor.html",
    },
    legacy: {
      manager: "/dashboard.html",
      assessor: "/index.html",
      vendor: "/vendor-portal.html",
    },
  };
  async function withPage(token, role, target, fn) {
    const initial = [
      ...(token ? [{ name: "trackscore_token", value: token }] : []),
      { name: "trackscore_user_role", value: role },
      {
        name: "trackscore_user",
        value: JSON.stringify({ role, name: "Storage forged Manager" }),
      },
    ];
    const isolated = await browser.newContext({
      storageState: {
        cookies: [],
        origins: [{ origin: dev.base, localStorage: initial }],
      },
    });
    const flashes = new Set();
    await isolated.exposeBinding("__reportPrivateFlash", (_, target) =>
      flashes.add(target),
    );
    await isolated.route("https://fonts.googleapis.com/**", (r) =>
      r.fulfill({ contentType: "text/css", body: "" }),
    );
    await isolated.addInitScript(
      ({ token, role, target }) => {
        sessionStorage.setItem("manager_authenticated", "true");
        window.__privateFlash = false;
        const privateNodes = () => {
          if (location.pathname !== target) return;
          const selector = target.includes("/react/")
            ? ".ts-layout,.ts-topbar,.navbar"
            : target.includes("dashboard")
              ? "#overview-active,#evaluations-tbody"
              : target.includes("vendor")
                ? "#tab-assessments,#stats-total,#evaluations-grid"
                : "#criteria-list,#submit-btn,#assessment-form";
          for (const el of document.querySelectorAll(selector))
            if (
              getComputedStyle(el).visibility !== "hidden" &&
              el.getClientRects().length
            ) {
              window.__privateFlash = true;
              window.__reportPrivateFlash(target);
            }
        };
        window.__securityObserver = new MutationObserver(privateNodes);
        window.__securityObserver.observe(document, {
          subtree: true,
          childList: true,
          attributes: true,
        });
      },
      { token, role, target },
    );
    const p = await isolated.newPage();
    p.setDefaultTimeout(12000);
    try {
      return await fn(p, flashes);
    } finally {
      await isolated.close();
    }
  }
  try {
    for (const kind of Object.keys(routes))
      for (const role of ["manager", "assessor", "vendor"])
        for (const targetRole of ["manager", "assessor", "vendor"])
          await check(
            `Security ${kind}: ${role} ${role === targetRole ? "enters" : "cannot enter"} ${targetRole} portal`,
            async () => {
              const target = routes[kind][targetRole];
              return withPage(
                tokenFor(role),
                targetRole,
                target,
                async (p, flashes) => {
                  await p.route("**/verify-session", async (r) => {
                    await delay(300);
                    await r.continue();
                  });
                  await p.goto(dev.base + target);
                  await delay(150);
                  if (role !== targetRole)
                    assert.equal(
                      await p.evaluate(() => window.__privateFlash),
                      false,
                      "Protected content flashed before signature/role verification",
                    );
                  await delay(700);
                  if (role !== targetRole)
                    assert.equal(
                      flashes.size,
                      0,
                      "Protected content appeared in a denied portal.",
                    );
                  if (role === targetRole) {
                    assert.equal(new URL(p.url()).pathname, target);
                    assert.notEqual(
                      await p.evaluate(
                        () =>
                          getComputedStyle(document.documentElement).visibility,
                      ),
                      "hidden",
                    );
                    assert.ok(
                      !(await p.locator("body").innerText()).includes(
                        "access required",
                      ),
                    );
                  } else if (kind === "react" && targetRole === "manager")
                    assert.ok(
                      (await p.locator("body").innerText()).includes(
                        "Manager access required",
                      ),
                    );
                  else assert.notEqual(new URL(p.url()).pathname, target);
                  const data = {
                    kind,
                    role,
                    targetRole,
                    allowed: role === targetRole,
                    finalPath: new URL(p.url()).pathname,
                  };
                  evidence.push(data);
                  return data;
                },
              );
            },
            true,
          );
    for (const kind of Object.keys(routes))
      for (const value of [
        "missing",
        "expired",
        "invalid-signature",
        "edited-role",
      ])
        await check(
          `Security ${kind}: ${value} session never shows Manager content`,
          async () => {
            let token =
              value === "missing"
                ? null
                : value === "expired"
                  ? jwt.sign({ role: "manager", exp: 1 }, secret)
                  : value === "invalid-signature"
                    ? jwt.sign(
                        { role: "manager" },
                        "untrusted-security-secret-32-character",
                        { expiresIn: "1h" },
                      )
                    : tokenFor("assessor");
            if (value === "edited-role") {
              const parts = token.split(".");
              parts[1] = Buffer.from(
                JSON.stringify({
                  ...JSON.parse(Buffer.from(parts[1], "base64url")),
                  role: "manager",
                }),
              ).toString("base64url");
              token = parts.join(".");
            }
            return withPage(
              token,
              "manager",
              routes[kind].manager,
              async (p) => {
                await p.goto(dev.base + routes[kind].manager);
                await p.waitForURL("**/login.html");
                assert.equal(
                  await p.evaluate(() =>
                    Boolean(localStorage.getItem("trackscore_token")),
                  ),
                  false,
                );
                return { kind, session: value, finalPath: "/login.html" };
              },
            );
          },
          true,
        );
    await check(
      "Security direct HTTP: both API prefixes reject unsigned cross-role JWT edits",
      async () => {
        const parts = tokenFor("assessor").split(".");
        parts[1] = Buffer.from(
          JSON.stringify({
            ...JSON.parse(Buffer.from(parts[1], "base64url")),
            role: "manager",
          }),
        ).toString("base64url");
        const statuses = [];
        for (const prefix of ["/api", "/.netlify/functions"]) {
          const response = await fetch(
            dev.base + prefix + "/approve-evaluation",
            {
              method: "POST",
              headers: {
                Authorization: "Bearer " + parts.join("."),
                "Content-Type": "application/json",
              },
              body: '{"id":"phasea-assessment-0"}',
            },
          );
          assert.equal(response.status, 401);
          statuses.push(response.status);
        }
        return { statuses };
      },
    );
    await check(
      "Security browser: XSS company, comment, filename and address render as inert text in React and legacy Manager",
      async () => {
        const attack = '<img src=x onerror="window.__securityXss=true">';
        const scored = recomputeScores(
          [...SECTION_A_CRITERIA, ...SECTION_B_CRITERIA].map((c) => ({
            id: c.id,
            selectedOption: c.options[0].label,
            comment: attack,
          })),
        );
        const malicious = records.map((r, i) =>
          i
            ? r
            : {
                ...r,
                ...scored,
                companyName: attack,
                officeAddress: attack,
                comments: [{ text: attack, authorName: attack }],
                breakdown: scored.breakdown.map((b) => ({
                  ...b,
                  comment: attack,
                })),
                documents: [
                  {
                    name: attack + ".pdf",
                    category: "test_report",
                    uploadedAt: new Date().toISOString(),
                  },
                ],
              },
        );
        write("evaluations", malicious);
        for (const target of [
          "/react/manager.html#/assessments",
          "/dashboard.html",
        ])
          await withPage(
            tokenFor("manager"),
            "manager",
            new URL(target, dev.base).pathname,
            async (p) => {
              await p.goto(dev.base + target);
              if (target.includes("react"))
                await p
                  .getByRole("heading", { name: "Assessments", exact: true })
                  .waitFor();
              else await p.locator("#tab-btn-evaluations").click();
              if(target.includes('react'))await p.getByText(attack,{exact:true}).first().waitFor();else await p.locator('#evaluations-tbody').getByText(attack,{exact:false}).first().waitFor();
              if (target.includes("react")) {
                await p.goto(
                  dev.base +
                    "/react/manager.html#/assessments/" +
                    records[0]._id,
                );
                await p
                  .getByRole("tab", { name: "Vendor", exact: true })
                  .click();
                await p.getByText(attack, { exact: true }).first().waitFor();
                await p.getByText(attack + ".pdf", { exact: false }).waitFor();
                await p
                  .getByRole("tab", {
                    name: "Technical Assessment",
                    exact: true,
                  })
                  .click();
                await p.getByText(attack, { exact: true }).first().waitFor();
              } else {
                await p.evaluate(
                  (id) => window.openEvaluationDetails(id),
                  records[0]._id,
                );
                await p.locator('#details-modal').getByText(attack,{exact:false}).first().waitFor();
              }

              assert.equal(
                await p.evaluate(() => !!window.__securityXss),
                false,
              );
              assert.equal(await p.locator("img[onerror]").count(), 0);
            },
          );
        write("evaluations", records);
        return { renderedAsText: true, executed: false };
      },
    );
    await check(
      "Security browser: Vendor IDOR is denied and account fields cannot elevate role",
      async () => {
        const unauthorized = records.map((r) => ({
          ...r,
          registrationReferenceId: undefined,
        }));
        write("evaluations", unauthorized);
        write("vendors", [
          { ...vendors[0], linkedRegistrationIds: [records[0]._id] },
          {
            _id: "security-browser-b",
            contactEmail: "security-b@browser.test",
            companyName: "Vendor B",
            linkedRegistrationIds: [records[1]._id],
            isActive: true,
            passwordHash,
          },
        ]);
        await withPage(
          tokenFor("vendor"),
          "manager",
          routes.react.vendor,
          async (p) => {
            await p.goto(dev.base + routes.react.vendor);
            await p
              .getByRole("heading", {
                name: "Commercial Vehicle Telematics Registry",
              })
              .waitFor();
            const results = await p.evaluate(async (id) => {
              const headers = {
                Authorization:
                  "Bearer " + localStorage.getItem("trackscore_token"),
                "Content-Type": "application/json",
              };
              const statuses = [];
              for (const endpoint of [
                "get-assessment-history",
                "get-assessment-version",
                "vendor-documents",
              ])
                statuses.push(
                  (
                    await fetch(
                      "/api/" +
                        endpoint +
                        "?" +
                        new URLSearchParams({ evaluationId: id, version: "1" }),
                      { headers },
                    )
                  ).status,
                );
              const profile = await fetch("/api/vendor-profile", {
                method: "PUT",
                headers,
                body: JSON.stringify({
                  action: "update_profile",
                  role: "manager",
                  linkedRegistrationIds: [id],
                  isActive: false,
                  contactPerson: "Safe profile",
                }),
              });
              return { statuses, profile: profile.status };
            }, records[1]._id);
            assert.deepEqual(results.statuses, [403, 403, 403]);
            assert.equal(results.profile, 200);
          },
        );
        write("vendors", vendors);
        write("evaluations", records);
        return { idorStatuses: [403, 403, 403], massAssignmentBlocked: true };
      },
    );
    await check(
      "Security SSE: invalid JWT and forced password-change are denied; an open stream ends on expiry",
      async () => {
        for (const [token, status] of [
          [
            jwt.sign(
              { role: "manager" },
              "untrusted-security-secret-32-character",
            ),
            401,
          ],
          [
            jwt.sign({ role: "manager", mustChangePassword: true }, secret, {
              expiresIn: "1h",
            }),
            403,
          ],
        ])
          assert.equal(
            (
              await fetch(
                dev.base +
                  "/api/status-stream?token=" +
                  encodeURIComponent(token),
              )
            ).status,
            status,
          );
        const token = jwt.sign({ role: "manager" }, secret, { expiresIn: 2 });
        const controller = new AbortController(),
          timeout = setTimeout(() => controller.abort(), 5000);
        try {
          const response = await fetch(
            dev.base + "/api/status-stream?token=" + encodeURIComponent(token),
            { signal: controller.signal },
          );
          assert.equal(response.status, 200);
          const text = await response.text();
          assert.ok(text.startsWith(": connected"));
        } finally {
          clearTimeout(timeout);
        }
        return { expiresServerSide: true };
      },
    );
    await check(
      "Security HTTP: malformed/oversize bodies and private filesystem paths fail safely",
      async () => {
        const headers = {
          Authorization: "Bearer " + tokenFor("manager"),
          "Content-Type": "application/json",
        };
        const malformed = await fetch(dev.base + "/api/approve-evaluation", {
          method: "POST",
          headers,
          body: "{malformed",
        });
        assert.equal(malformed.status, 400);
        assert.ok(!(await malformed.text()).includes("SyntaxError"));
        for (const target of [
          "/.env",
          "/.data/evaluations.json",
          "/.uploads/doc_12345678901_abcd.bin",
          "/build/server.cjs",
          "/react/../../.env",
        ])
          assert.ok((await fetch(dev.base + target)).status >= 400);
        const pageResponse = await fetch(dev.base + "/login.html");
        assert.match(
          pageResponse.headers.get("content-security-policy"),
          /object-src 'none'/,
        );
        assert.equal(
          pageResponse.headers.get("referrer-policy"),
          "no-referrer",
        );
        return { malformedStatus: 400, privatePathsBlocked: 5 };
      },
    );
    await check('Security PDF: patched local engine produces an actual single-page A4 certificate',async()=>{
      const proof=[];
      for(const width of [375,1366])await withPage(tokenFor('manager'),'manager',routes.react.manager,async p=>{
        await p.setViewportSize({width,height:900});await p.goto(dev.base+routes.react.manager);await p.locator('.ts-metrics').waitFor();
        await p.addScriptTag({url:dev.base+'/pdf-engine.js'});await p.addScriptTag({url:dev.base+'/certificate-pdf.js'});
        const sanitized=await p.evaluate(async()=>{window.__pdfLibraryXss=false;const worker=window.html2pdf().from('<img src="data:image/png;base64,AAAA" onerror="window.__pdfLibraryXss=true">').toContainer();const node=await worker.get('container');const result={handlerRemoved:!node.querySelector('[onerror]'),executed:!!window.__pdfLibraryXss};node.parentElement.remove();return result;});
        assert.equal(sanitized.handlerRemoved,true);assert.equal(sanitized.executed,false);
        await p.evaluate(()=>{window.__pdfMeasurements=[];const save=window.html2pdf.Worker.prototype.save;window.html2pdf.Worker.prototype.save=function(...args){return save.apply(this,args).then(function(){window.__pdfMeasurements.push({width:this.prop.canvas.width,height:this.prop.canvas.height,pages:this.prop.pdf.internal.getNumberOfPages()});});};});
        const downloaded=p.waitForEvent('download');
        await p.evaluate(record=>window.downloadTrackScoreCertificatePdf(record,'Security-Certificate.pdf'),{_id:'security-pdf',companyName:'Security audit certificate '+('Long company name '.repeat(6)),deviceModel:'Security Gateway',status:'certificate_issued',starsCount:4,ratingLabel:'Verified',totalScore:85,certificate:{certificateNumber:'SEC-PDF',preparedDate:'2026-10-13',printedDate:'2026-10-13',signedBy:'Fixture DGO',signedDate:'2026-10-13',certifiedVersion:1}});
        const file=await downloaded,target=path.join(qa,'security-certificate-'+width+'.pdf');await file.saveAs(target);assert.ok(fs.readFileSync(target).subarray(0,5).equals(Buffer.from('%PDF-')));
        const measurement=await p.evaluate(()=>window.__pdfMeasurements[0]);assert.equal(measurement.pages,1);assert.equal(measurement.width,1588);assert.equal(measurement.height,2240);proof.push({viewport:width,...measurement,bytes:fs.statSync(target).size});
      });fs.writeFileSync(path.join(qa,'security-pdf-proof.json'),JSON.stringify(proof,null,2));return proof;
    });
    await check("Security public pages avoid protected API calls", async () => {
      for (const target of [
        "/landing.html",
        "/verify-certificate.html",
        "/login.html",
      ])
        await withPage(null, "vendor", target, async (p) => {
          const privateCalls = [];
          p.on("request", (r) => {
            if (
              /get-evaluations|vendor-portal-data|status-stream|vendor-profile|get-assessment-history/.test(
                r.url(),
              )
            )
              privateCalls.push(new URL(r.url()).pathname);
          });
          await p.goto(dev.base + target);
          await delay(250);
          assert.deepEqual(privateCalls, []);
        });
      return { protectedRequests: 0 };
    });
  } finally {
    for (const [name, value] of snapshots)
      fs.writeFileSync(path.join(sandbox, ".data", name + ".json"), value);
    fs.writeFileSync(
      path.join(qa, "security-browser-matrix.json"),
      JSON.stringify(evidence, null, 2),
    );
  }
  await login("manager");
  await overview();
}
