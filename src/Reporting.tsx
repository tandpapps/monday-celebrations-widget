import { useEffect, useMemo, useState } from "react";
import mondaySdk from "monday-sdk-js";

const monday = mondaySdk();

const HR_BOARD_ID = 5099059636;
const LEAVE_BOARD_ID = 5091696146;

const HR = {
  department: "dropdown_mm4ky8en",
  position: "text_mm4kzj52",
  manager: "multiple_person_mm4kzcth",
  startDate: "date_mm4kbtht",
  location: "dropdown_mm4kk268",
  employmentType: "dropdown_mm4k2zrk",
  probationEnd: "date_mm