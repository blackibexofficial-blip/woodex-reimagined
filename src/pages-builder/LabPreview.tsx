import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Render } from "@puckeditor/core";
import { FlaskConical } from "lucide-react";
import { woodexConfig } from "./blocks";
import { LAB_DEFAULT_SLUG, labHomeStarter, readLabPage } from "./starter";

/**
 * Read-only storefront render of the pages-lab spike page. No Header/Footer,
 * noindex, floating badge — this route exists to prove block rendering, it is
 * not a public surface yet (master plan waves decide what ships and how).
 */
const LabPreview = () => {
  const { slug } = useParams<{ slug: string }>();
  const key = slug ?? LAB_DEFAULT_SLUG;
  const [data] = useState(() => readLabPage(key) ?? labHomeStarter);

  useEffect(() => {
    document.title = "Lab preview — WOODEX";
    let meta = document.querySelector('meta[name="robots"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "robots");
      document.head.appendChild(meta);
    }
    const previous = meta.getAttribute("content");
    meta.setAttribute("content", "noindex,nofollow");
    return () => {
      if (previous) meta.setAttribute("content", previous);
      else meta.remove();
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-900 shadow-lg">
        <FlaskConical className="h-4 w-4" />
        Lab preview — spike, not published
        <Link to="/admin/pages-lab" className="underline underline-offset-2 hover:text-amber-950">edit</Link>
      </div>
      <Render config={woodexConfig} data={data} />
    </div>
  );
};

export default LabPreview;
