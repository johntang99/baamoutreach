import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

const SAMPLE_ROWS = [
  {
    email: "olivia.chen@example.com",
    name: "Olivia Chen",
    company: "Northstar Ventures",
    language: "en",
  },
  {
    email: "wei.zhang@example.com",
    name: "Wei Zhang",
    company: "Blue Harbor Capital",
    language: "zh",
  },
  {
    email: "carlos.rivera@example.com",
    name: "Carlos Rivera",
    company: "Pioneer Advisors",
    language: "es",
  },
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const format = (searchParams.get("format") || "csv").toLowerCase();

  if (format === "xlsx") {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(SAMPLE_ROWS);
    XLSX.utils.book_append_sheet(workbook, sheet, "Sample List");
    const output = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(output, {
      status: 200,
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition":
          'attachment; filename="baam-outreach-list-sample.xlsx"',
      },
    });
  }

  const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(SAMPLE_ROWS));
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="baam-outreach-list-sample.csv"',
    },
  });
}
