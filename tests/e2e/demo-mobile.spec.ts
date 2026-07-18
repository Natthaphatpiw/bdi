import { expect, test, type Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      })),
    )
    .toEqual({ clientWidth: 390, scrollWidth: 390 });
}

test.describe("booth demo on a 390×844 mobile viewport", () => {
  test("landing has no horizontal overflow at every supported mobile width", async ({ page }) => {
    for (const width of [360, 375, 390, 414, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/demo");
      await expect(
        page.getByRole("heading", {
          name: "เล่าอาการครั้งเดียว ได้เส้นทางดูแลที่ทำตามได้",
        }),
      ).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(() => ({
            clientWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
          })),
        )
        .toEqual({ clientWidth: width, scrollWidth: width });
    }
  });

  test("hero journey reaches a verified route, reasoning, Passport QR, feedback, and one-click reset", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const externalProviderRequests: string[] = [];
    page.on("request", (request) => {
      if (/anthropic|claude|runpod|neo4j/i.test(request.url())) {
        externalProviderRequests.push(request.url());
      }
    });

    await page.goto("/demo");
    await expect(
      page.getByRole("heading", {
        name: "เล่าอาการครั้งเดียว ได้เส้นทางดูแลที่ทำตามได้",
      }),
    ).toBeVisible();
    await expect(page.getByText("โหมดสาธิต", { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByRole("button", { name: /ทดลองด้วยเคสตัวอย่าง/ }).click();
    await expect(
      page.getByRole("heading", {
        name: /ตอนนี้มีหมดสติ หายใจลำบากรุนแรง/,
      }),
    ).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "ไม่มี", exact: true }).click();

    await expect(page.getByRole("heading", { name: "เราเข้าใจเคสนี้ว่า" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByLabel("อายุ")).toHaveValue("68");
    await expect(page.getByLabel("สิทธิ์")).toHaveValue("CSMBS");
    await page
      .getByRole("button", { name: "ยืนยันและสร้างเส้นทางดูแล", exact: true })
      .click();

    await expect(page.getByRole("heading", { name: "เส้นทางดูแลของคุณ" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("เส้นทางหลัก", { exact: true })).toBeVisible();
    await expect(page.getByText("เส้นทางสำรอง", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "สิ่งที่ควรทำตอนนี้" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const primaryMobileCta = page.getByRole("button", { name: "นำทาง", exact: true }).last();
    await expect(primaryMobileCta).toBeVisible();
    const primaryCtaBox = await primaryMobileCta.boundingBox();
    expect(primaryCtaBox).not.toBeNull();
    expect(primaryCtaBox?.height ?? 0).toBeGreaterThanOrEqual(44);

    await page.reload();
    await expect(page.getByRole("heading", { name: "เส้นทางดูแลของคุณ" })).toBeVisible({
      timeout: 20_000,
    });

    await page
      .getByRole("button", { name: "ทำไมแนะนำเส้นทางนี้", exact: true })
      .click();
    const whyDialog = page.getByRole("dialog", { name: "ทำไมแนะนำเส้นทางนี้" });
    await expect(whyDialog).toBeVisible();
    await expect(whyDialog.getByRole("heading", { name: "เหตุผลด้านความปลอดภัย" })).toBeVisible();
    await expect(whyDialog.getByRole("heading", { name: "เหตุผลด้านสิทธิ์" })).toBeVisible();
    await expect(whyDialog.getByRole("heading", { name: "เหตุผลด้านสถานที่" })).toBeVisible();
    await whyDialog.getByRole("button", { name: "ปิด", exact: true }).click();

    await page
      .getByRole("button", {
        name: "สร้างข้อมูลสรุปเพื่อใช้เตรียมตัวและยื่นให้สถานพยาบาล",
        exact: true,
      })
      .click();
    const passportDialog = page.getByRole("dialog", { name: "Case Passport" });
    await expect(passportDialog).toBeVisible();
    await expect(passportDialog.getByRole("heading", { name: "Case Passport" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(passportDialog.getByText("ข้อมูลสรุปก่อนเข้ารับบริการ", { exact: true })).toBeVisible();
    await expect(passportDialog.getByText("ภาวะที่อาจเกี่ยวข้อง", { exact: true })).toBeVisible();
    await expect(passportDialog).not.toContainText(/Claude|Anthropic|ThaiLLM|fallback|provider_internal/i);

    const shareSection = passportDialog.getByRole("region", { name: "แชร์ข้อมูลชั่วคราว" });
    await shareSection
      .getByLabel("ฉันยินยอมให้สร้างลิงก์ชั่วคราวสำหรับข้อมูลสรุปนี้")
      .check();
    await shareSection.getByRole("button", { name: "สร้างลิงก์แชร์", exact: true }).click();
    await expect(shareSection.getByText(/ลิงก์พร้อมใช้ถึง/)).toBeVisible({ timeout: 20_000 });
    await expect(
      shareSection.getByRole("img", {
        name: "คิวอาร์โค้ดสำหรับเปิด Case Passport ผ่านลิงก์แชร์ชั่วคราว",
      }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(shareSection.getByText(/ไม่ฝังข้อมูลผู้ป่วยหรือข้อมูลลับอื่น/)).toBeVisible();
    await shareSection.getByRole("button", { name: "เพิกถอน", exact: true }).click();
    await expect(shareSection.getByRole("button", { name: "สร้างลิงก์แชร์", exact: true })).toBeVisible();
    await passportDialog.getByRole("button", { name: "ปิด", exact: true }).click();

    await page
      .getByRole("button", { name: /ได้รับบริการตามเส้นทางที่แนะนำหรือไม่/ })
      .click();
    await page.getByRole("button", { name: "ได้รับบริการตามแผน", exact: true }).click();
    await page.getByRole("button", { name: "ถัดไป", exact: true }).click();
    await page.getByRole("button", { name: "ใช้ได้", exact: true }).click();
    await page.getByRole("button", { name: "ถัดไป", exact: true }).click();
    await page.getByLabel("3. มีอะไรไม่ตรงกับข้อมูล").fill("ข้อมูลตรงตามที่แสดง");
    await page.getByRole("button", { name: "ส่งผลการใช้บริการ", exact: true }).click();
    await expect(page.getByText("ขอบคุณที่ช่วยยืนยันการเข้าถึงบริการ")).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("button", { name: "เริ่มใหม่", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "เล่าอาการครั้งเดียว ได้เส้นทางดูแลที่ทำตามได้",
      }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const raw = sessionStorage.getItem("rusit-mvp-demo-v1:web");
          if (!raw) return null;
          const state = JSON.parse(raw) as {
            phase?: string;
            story?: { narrative?: string };
            caseRecord?: unknown;
            route?: unknown;
          };
          return {
            phase: state.phase,
            narrative: state.story?.narrative,
            caseRecord: state.caseRecord ?? null,
            route: state.route ?? null,
          };
        }),
      )
      .toEqual({ phase: "welcome", narrative: "", caseRecord: null, route: null });
    await expectNoHorizontalOverflow(page);
    expect(externalProviderRequests).toEqual([]);
  });

  test("emergency story stops at 1669 and does not show a normal primary route", async ({ page }) => {
    await page.goto("/demo");
    await page.getByRole("button", { name: "พิมพ์เรื่องของฉันเอง", exact: true }).click();
    await page
      .getByLabel("เรื่องที่เกิดขึ้น")
      .fill("พ่อเจ็บหน้าอกรุนแรงและหายใจไม่ออก เริ่มเมื่อครึ่งชั่วโมงก่อน");
    await page.getByRole("button", { name: "พ่อ", exact: true }).click();
    await page.getByRole("button", { name: "ลาดพร้าว", exact: true }).click();
    await page.getByRole("button", { name: "เริ่มตรวจเส้นทางดูแล", exact: true }).click();

    await expect(
      page.getByRole("heading", {
        name: "อาการที่เล่ามาอาจต้องได้รับความช่วยเหลือฉุกเฉิน",
      }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("link", { name: "โทร 1669 ทันที", exact: true })).toHaveAttribute(
      "href",
      "tel:1669",
    );
    await expect(page.getByText("เส้นทางหลัก", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "เส้นทางดูแลของคุณ" })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });
});
