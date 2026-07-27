import { type MouseEvent, useState } from "react";
import { BookOpenText, Home, LibraryBig, X } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { logError } from "@/lib/logger";
import gplLicense from "../../../LICENSE?raw";
import notices from "@/generated/third-party-notices.json";

type ThirdPartyPackage = {
  ecosystem: "Cargo" | "npm";
  name: string;
  version: string;
  license: string;
  licenseUrl: string;
  website?: string;
};

type NoticeData = {
  packages: ThirdPartyPackage[];
};

const thirdPartyNotices = notices as NoticeData;
const GITHUB_URL = "https://github.com/Xwei1645/zooni-next";

export function AboutSettings() {
  const [licenseOpen, setLicenseOpen] = useState(false);
  const [librariesOpen, setLibrariesOpen] = useState(false);

  return (
    <section className="settings-panel about-panel" aria-labelledby="about-title">
      <article className="about-card">
        <div className="about-app-header">
          <div className="about-app-mark" aria-hidden="true">Z</div>
          <div>
            <h2 id="about-title">Zooni Next</h2>
            <p>版本 {__APP_VERSION__} (Codename Oak)</p>
          </div>
        </div>
        <p className="about-copyright">Copyright © 2026 Xwei1645</p>
        <p className="about-license-note">本项目基于 GNU General Public License v3.0 获得许可。</p>
        <div className="about-actions">
          <a className="about-icon-link" href={GITHUB_URL} target="_blank" rel="noreferrer" onClick={(event) => handleExternalLink(event, GITHUB_URL)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .297a12 12 0 0 0-3.794 23.4c.6.111.82-.261.82-.58v-2.234c-3.338.726-4.043-1.416-4.043-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.085 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.419-1.304.762-1.604-2.665-.303-5.467-1.333-5.467-5.93 0-1.31.469-2.381 1.236-3.221-.124-.303-.536-1.523.117-3.176 0 0 1.008-.323 3.3 1.23A11.48 11.48 0 0 1 12 5.8c1.02.005 2.047.138 3.006.404 2.29-1.553 3.296-1.23 3.296-1.23.655 1.653.243 2.873.12 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.48 5.921.43.37.814 1.096.814 2.21v3.276c0 .322.216.696.825.578A12.002 12.002 0 0 0 12 .297Z" /></svg>
            GitHub
          </a>
          <Button type="button" variant="outline" size="sm" onClick={() => setLicenseOpen(true)}>
            <BookOpenText aria-hidden="true" />
            开放源代码许可
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setLibrariesOpen(true)}>
            <LibraryBig aria-hidden="true" />
            第三方库
          </Button>
        </div>
      </article>

      <Dialog open={licenseOpen} onOpenChange={setLicenseOpen}>
        <DialogContent className="about-license-dialog" aria-labelledby="license-dialog-title">
          <header className="about-dialog-header">
            <h3 id="license-dialog-title">开放源代码许可</h3>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="关闭" onClick={() => setLicenseOpen(false)}><X aria-hidden="true" /></Button>
          </header>
          <ScrollArea className="about-license-scroll"><pre className="gpl-license-text">{gplLicense}</pre></ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={librariesOpen} onOpenChange={setLibrariesOpen}>
        <DialogContent className="about-libraries-drawer" aria-labelledby="libraries-dialog-title">
          <header className="about-dialog-header">
            <h3 id="libraries-dialog-title">第三方库</h3>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="关闭" onClick={() => setLibrariesOpen(false)}><X aria-hidden="true" /></Button>
          </header>
          <ScrollArea className="third-party-list" aria-label="第三方库">
            {thirdPartyNotices.packages.map((item) => (
              <div className="third-party-item" key={packageId(item)}>
                <div><strong>{item.name}</strong><small>{item.version} · {item.ecosystem}</small></div>
                <span>{item.license}</span>
                <div className="third-party-item-links">
                  {item.website && <a href={item.website} target="_blank" rel="noreferrer" onClick={(event) => handleExternalLink(event, item.website!)}><Home aria-hidden="true" /><span className="sr-only">访问 {item.name} 网站</span></a>}
                  <a href={item.licenseUrl} target="_blank" rel="noreferrer" onClick={(event) => handleExternalLink(event, item.licenseUrl)}><BookOpenText aria-hidden="true" /><span className="sr-only">查看 {item.name} 许可证</span></a>
                </div>
              </div>
            ))}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function packageId(item: ThirdPartyPackage) {
  return `${item.ecosystem}:${item.name}@${item.version}`;
}

function handleExternalLink(event: MouseEvent<HTMLAnchorElement>, url: string) {
  event.preventDefault();
  void openUrl(url).catch((error) => logError("about.open-url", error));
}
