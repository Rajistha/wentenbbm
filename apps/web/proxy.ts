import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Lewati API, aset Next, dan file statis (sw.js, ikon, dsb.)
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
