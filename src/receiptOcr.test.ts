import { describe, expect, it } from "vitest";
import { parseReceiptText } from "./receiptOcr";

describe("local receipt parsing", () => {
  it("extracts a merchant, date, and confirmed total candidate", () => {
    const parsed = parseReceiptText("Harbour Cafe\n03/14/2027 18:42\nSoup 12.00\nTea 4.00\nTOTAL $16.00\nVISA PAYMENT 16.00");
    expect(parsed).toMatchObject({ merchant: "Harbour Cafe", date: "2027-03-14", totalCents: 1_600 });
  });

  it("prefers total and excludes subtotal, tax, tip, change, and payment lines", () => {
    const parsed = parseReceiptText("North Market\nSubtotal 42.00\nTax 5.46\nTip 9.50\nGRAND TOTAL $56.96\nCredit payment 56.96\nChange 2.00");
    expect(parsed.totalCents).toBe(5_696);
    expect(parsed.totalCandidates.map((candidate) => candidate.line)).toEqual(["GRAND TOTAL $56.96"]);
  });

  it("supports ISO dates and comma decimal OCR", () => {
    const parsed = parseReceiptText("Corner Bakery\n2027-11-05\nAmount due CAD 18,75");
    expect(parsed.date).toBe("2027-11-05");
    expect(parsed.totalCents).toBe(1_875);
  });

  it("does not mistake a price line for the merchant", () => {
    const parsed = parseReceiptText("$19.99\nRiver Books\nTOTAL 19.99");
    expect(parsed.merchant).toBe("River Books");
  });

  it("returns null when no credible total exists", () => {
    const parsed = parseReceiptText("Example Store\nThank you for visiting");
    expect(parsed.totalCents).toBeNull();
  });
});
