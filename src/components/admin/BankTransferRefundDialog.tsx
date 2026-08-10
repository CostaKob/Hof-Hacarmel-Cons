import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ISRAELI_BANKS, findBankByCode } from "@/lib/israeliBanks";
import { getBranches } from "@/lib/israeliBankBranches";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useAppLogo } from "@/hooks/useAppLogo";
import type { RefundSuccessInfo } from "@/components/admin/RefundSuccessDialog";

const TEMPLATE_KEY = "bank-refund-letter-template-v2";
const MAIN_MSG_KEY = "bank-refund-main-message-v1";

export const DEFAULT_MAIN_MESSAGE = `אבקש לבטל {{סוג_ביטול}} עסקת אשראי ע"י העברה בנקאית עבור {{שם_ההורה}}.`;

const DEFAULT_TEMPLATE = `שלום רב,

{{הודעה_ראשית}}

{{שם_ההורה}} שילם/ה: {{סכום_ששולם}} ₪
יש לזכות את הנ"ל בסך של: {{סכום_הזיכוי}} ₪
{{הערות}}

יש לבצע העברה בנקאית ל-
{{שם_בעל_החשבון}}
ת"ז: {{תז_בעל_החשבון}}
{{שם_הבנק}} {{מספר_בנק}}
סניף: {{סניף}}
מס' חשבון: {{מספר_חשבון}}

בברכה,
{{שם_החותם}}
{{שם_הארגון}}
{{פרטי_קשר}}`;

export interface BankRefundDefaults {
  studentId?: string;
  parentName?: string;
  studentName?: string;
  subject?: string;
  paidAmount?: number;
  refundAmount?: number;
  paymentId: string;
  docNumber?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaults: BankRefundDefaults | null;
  onDone: (info: RefundSuccessInfo) => void;
  invalidate: () => void;
}

const BankTransferRefundDialog = ({ open, onOpenChange, defaults, onDone, invalidate }: Props) => {
  const queryClient = useQueryClient();
  const { logoUrl } = useAppLogo();

  const [letterDate, setLetterDate] = useState(format(new Date(), "dd/MM/yyyy"));
  const [subject, setSubject] = useState("");
  const [cancelKind, setCancelKind] = useState("חלקית");
  const [parentName, setParentName] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [accountOwner, setAccountOwner] = useState("");
  const [ownerNationalId, setOwnerNationalId] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankNumber, setBankNumber] = useState("");
  const [manualBank, setManualBank] = useState(false);
  const [branch, setBranch] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [signer, setSigner] = useState(() => localStorage.getItem("bank-refund-signer") || "קורין פאר");
  const [orgName, setOrgName] = useState(() => localStorage.getItem("bank-refund-org") || "אולפן המוסיקה משותף חוף הכרמל");
  const [contact, setContact] = useState(() => localStorage.getItem("bank-refund-contact") || "");
  const [mainMessage, setMainMessage] = useState(() => localStorage.getItem(MAIN_MSG_KEY) || DEFAULT_MAIN_MESSAGE);
  const [template, setTemplate] = useState(() => localStorage.getItem(TEMPLATE_KEY) || DEFAULT_TEMPLATE);
  const [showTemplate, setShowTemplate] = useState(false);

  // Step 2 — after the money was actually transferred
  const [reference, setReference] = useState("");
  const [transferDate, setTransferDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: student } = useQuery({
    queryKey: ["bank-refund-student", defaults?.studentId],
    enabled: open && !!defaults?.studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("first_name,last_name,parent_name,parent_national_id")
        .eq("id", defaults!.studentId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!open || !student) return;
    setParentName((v) => v || student.parent_name || "");
    setAccountOwner((v) => v || student.parent_name || "");
    setOwnerNationalId((v) => v || student.parent_national_id || "");
    setSubject((v) => v || `שיעורי מוסיקה — ${student.first_name} ${student.last_name}`);
  }, [open, student]);

  useEffect(() => {
    if (!open || !defaults) return;
    setLetterDate(format(new Date(), "dd/MM/yyyy"));
    setSubject(defaults.subject || (defaults.studentName ? `שיעורי מוסיקה — ${defaults.studentName}` : ""));
    setParentName(defaults.parentName || "");
    setAccountOwner(defaults.parentName || "");
    setPaidAmount(defaults.paidAmount != null ? String(defaults.paidAmount) : "");
    setRefundAmount(defaults.refundAmount != null ? String(defaults.refundAmount) : "");
    setNotes("");
    setReference("");
    setTransferDate(format(new Date(), "yyyy-MM-dd"));
  }, [open, defaults]);

  const filled = useMemo(() => {
    const map: Record<string, string> = {
      "סוג_ביטול": cancelKind,
      "שם_ההורה": parentName,
      "סכום_ששולם": Number(paidAmount || 0).toLocaleString(),
      "סכום_הזיכוי": Number(refundAmount || 0).toLocaleString(),
      "הערות": notes,
      "שם_בעל_החשבון": accountOwner,
      "תז_בעל_החשבון": ownerNationalId,
      "שם_הבנק": bankName,
      "מספר_בנק": bankNumber,
      "סניף": branch,
      "מספר_חשבון": accountNumber,
      "שם_החותם": signer,
      "שם_הארגון": orgName,
      "פרטי_קשר": contact,
    };
    const apply = (s: string) => s.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, k: string) => map[k.trim()] ?? "");
    map["הודעה_ראשית"] = apply(mainMessage);
    return apply(template);
  }, [template, mainMessage, cancelKind, parentName, paidAmount, refundAmount, notes, accountOwner, ownerNationalId,
      bankName, bankNumber, branch, accountNumber, signer, orgName, contact]);

  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));

  const buildHtml = () => `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8">
<title>בקשת החזר בהעברה בנקאית</title>
<style>
  @page { size: A4; margin: 20mm; }
  body { font-family: "Arial", "Helvetica", sans-serif; direction: rtl; color: #111; line-height: 1.9; font-size: 15px; }
  .logo { max-height: 90px; margin-bottom: 8px; }
  .date { font-size: 13px; color: #444; }
  h1 { font-size: 17px; margin: 18px 0 4px; text-decoration: underline; }
  h2 { font-size: 15px; margin: 0 0 18px; text-decoration: underline; font-weight: 600; }
  pre { font-family: inherit; font-size: 15px; white-space: pre-wrap; margin: 0; }
</style></head><body>
<img class="logo" src="${logoUrl}" alt="" />
<div class="date">${esc(letterDate)}</div>
<h1>הנדון: ביטול עסקת אשראי ${esc(cancelKind)} ע"י העברה בנקאית</h1>
${subject ? `<h2>עבור: ${esc(subject)}</h2>` : ""}
<pre>${esc(filled)}</pre>
</body></html>`;

  const saveDocument = async (html: string) => {
    const path = `${defaults?.studentId || "general"}/${Date.now()}-refund-letter.html`;
    const { error: upErr } = await supabase.storage
      .from("refund-documents")
      .upload(path, new Blob([html], { type: "text/html;charset=utf-8" }), {
        contentType: "text/html;charset=utf-8",
      });
    if (upErr) throw upErr;
    const { data: userRes } = await supabase.auth.getUser();
    const { error: insErr } = await supabase.from("refund_documents").insert({
      payment_id: defaults?.paymentId ?? null,
      student_id: defaults?.studentId ?? null,
      doc_type: "bank_transfer_letter",
      title: `מכתב להנהלת חשבונות — ${parentName || accountOwner || ""}${defaults?.docNumber ? ` (קבלה ${defaults.docNumber})` : ""}`,
      parent_name: parentName || accountOwner || null,
      refund_amount: Number(refundAmount) || null,
      bank_reference: reference || null,
      content_text: filled,
      content_html: html,
      file_path: path,
      created_by: userRes?.user?.id ?? null,
    });
    if (insErr) throw insErr;
    queryClient.invalidateQueries({ queryKey: ["refund-documents", defaults?.paymentId] });
  };

  const generateFile = async () => {
    if (!accountNumber || !bankName || !branch) {
      toast.error("נא למלא בנק, סניף ומספר חשבון");
      return;
    }
    localStorage.setItem(TEMPLATE_KEY, template);
    localStorage.setItem(MAIN_MSG_KEY, mainMessage);
    localStorage.setItem("bank-refund-signer", signer);
    localStorage.setItem("bank-refund-org", orgName);
    localStorage.setItem("bank-refund-contact", contact);
    const html = buildHtml();
    const w = window.open("", "_blank");
    if (!w) { toast.error("החלון נחסם על ידי הדפדפן"); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 500);
    try {
      await saveDocument(html);
      toast.success("המסמך נשמר בארכיון המסמכים");
    } catch (e: any) {
      toast.error(`המסמך נוצר אך לא נשמר: ${e?.message ?? ""}`);
    }
  };

  const { data: savedDocs = [] } = useQuery({
    queryKey: ["refund-documents", defaults?.paymentId],
    enabled: open && !!defaults?.paymentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("refund_documents")
        .select("id,title,created_at,file_path,refund_amount")
        .eq("payment_id", defaults!.paymentId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const openSavedDoc = async (filePath: string | null) => {
    if (!filePath) return;
    const { data, error } = await supabase.storage
      .from("refund-documents")
      .createSignedUrl(filePath, 3600);
    if (error || !data?.signedUrl) { toast.error("לא ניתן לפתוח את המסמך"); return; }
    window.open(data.signedUrl, "_blank");
  };


  const refundMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("icount-create-refund", {
        body: {
          paymentId: defaults!.paymentId,
          amount: Number(refundAmount),
          reason: notes || undefined,
          refundMethod: "bank_transfer",
          bankReference: reference,
          bankTransferDate: transferDate,
          bankDetails: {
            accountOwner, ownerNationalId, bankName, bankNumber, branch, accountNumber,
          },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "iCount error");
      return data;
    },
    onSuccess: (data: any) => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["admin-year-payments"] });
      onOpenChange(false);
      onDone({
        amount: Number(data?.refund_amount ?? refundAmount ?? 0),
        docNumber: data?.doc_number,
        sentToEmail: data?.sent_to_email,
        url: data?.url,
        ccRefund: false,
      });
    },
    onError: (e: any) => toast.error(`שגיאה בהפקת קבלת זיכוי: ${e?.message ?? ""}`),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!refundMutation.isPending) onOpenChange(o); }}>
        <DialogContent dir="rtl" className="max-w-4xl max-h-[90vh] overflow-y-auto overscroll-contain">
          <DialogHeader>
            <DialogTitle>החזר בהעברה בנקאית{defaults?.docNumber ? ` — קבלה ${defaults.docNumber}` : ""}</DialogTitle>
            <DialogDescription>
              שלב א׳: מילוי פרטי ההעברה והפקת מסמך להנהלת החשבונות. שלב ב׳: לאחר ביצוע ההעברה — הזנת אסמכתא והפקת קבלת זיכוי להורה.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Form */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>תאריך המסמך</Label>
                  <Input className="h-11 rounded-xl" value={letterDate} onChange={(e) => setLetterDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>סוג ביטול</Label>
                  <Input className="h-11 rounded-xl" value={cancelKind} onChange={(e) => setCancelKind(e.target.value)} placeholder="חלקית / מלאה" />
                </div>
              </div>

              <div className="space-y-1">
                <Label>עבור (נושא)</Label>
                <Input className="h-11 rounded-xl" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>שם ההורה המשלם</Label>
                  <Input className="h-11 rounded-xl" value={parentName} onChange={(e) => setParentName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>סכום ששולם (₪)</Label>
                  <Input type="number" className="h-11 rounded-xl" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} />
                </div>
              </div>

              <div className="space-y-1">
                <Label>סכום הזיכוי (₪)</Label>
                <Input type="number" className="h-11 rounded-xl" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label>הערות (אופציונלי)</Label>
                <Input className="h-11 rounded-xl" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="לדוגמה: הורים גרושים, יתבצעו שני החזרים" />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label>הודעה ראשית</Label>
                  <Button type="button" variant="ghost" className="h-7 px-2 text-xs"
                    onClick={() => { setMainMessage(DEFAULT_MAIN_MESSAGE); localStorage.removeItem(MAIN_MSG_KEY); }}>
                    איפוס
                  </Button>
                </div>
                <Textarea className="rounded-xl min-h-[80px] text-sm" value={mainMessage}
                  onChange={(e) => setMainMessage(e.target.value)} />
                <p className="text-[11px] text-muted-foreground">
                  ניתן להשתמש במשתנים: {"{{סוג_ביטול}} {{שם_ההורה}} {{סכום_הזיכוי}}"}
                </p>
              </div>

              <div className="rounded-xl border border-border p-3 space-y-3">
                <p className="text-sm font-semibold">פרטי חשבון להעברה</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>שם בעל החשבון</Label>
                    <Input className="h-11 rounded-xl" value={accountOwner} onChange={(e) => setAccountOwner(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>ת״ז בעל החשבון</Label>
                    <Input className="h-11 rounded-xl" inputMode="numeric" value={ownerNationalId} onChange={(e) => setOwnerNationalId(e.target.value)} />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <div className="flex items-center justify-between">
                      <Label>בנק</Label>
                      <Button type="button" variant="ghost" className="h-7 px-2 text-xs"
                        onClick={() => setManualBank((m) => !m)}>
                        {manualBank ? "בחירה מרשימה" : "הזנה ידנית"}
                      </Button>
                    </div>
                    {manualBank ? (
                      <div className="grid grid-cols-2 gap-3">
                        <Input className="h-11 rounded-xl" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="שם הבנק" />
                        <Input className="h-11 rounded-xl" inputMode="numeric" value={bankNumber} onChange={(e) => setBankNumber(e.target.value)} placeholder="מספר בנק" />
                      </div>
                    ) : (
                      <Select
                        value={bankNumber || undefined}
                        onValueChange={(v) => { setBankNumber(v); setBankName(findBankByCode(v)?.name || ""); }}
                      >
                        <SelectTrigger className="h-11 rounded-xl">
                          <SelectValue placeholder="בחר בנק" />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          {ISRAELI_BANKS.map((b) => (
                            <SelectItem key={b.code} value={b.code}>{b.name} ({b.code})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label>סניף</Label>
                      {branchOptions.length > 0 && (
                        <Button type="button" variant="ghost" className="h-7 px-2 text-xs"
                          onClick={() => setManualBranch((m) => !m)}>
                          {manualBranch ? "בחירה מרשימה" : "הזנה ידנית"}
                        </Button>
                      )}
                    </div>
                    {manualBranch || branchOptions.length === 0 ? (
                      <Input className="h-11 rounded-xl" inputMode="numeric" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="7" />
                    ) : (
                      <Popover open={branchOpen} onOpenChange={setBranchOpen}>
                        <PopoverTrigger asChild>
                          <Button type="button" variant="outline" className="h-11 w-full rounded-xl justify-between font-normal">
                            <span className="truncate">
                              {branch
                                ? `${branch}${selectedBranch ? ` - ${selectedBranch.name}` : ""}`
                                : "בחר סניף"}
                            </span>
                            <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[260px]" align="start">
                          <Command
                            filter={(value, search) => (value.includes(search) ? 1 : 0)}
                          >
                            <CommandInput placeholder="חיפוש סניף / עיר / מספר" />
                            <CommandList className="max-h-64">
                              <CommandEmpty>לא נמצא סניף</CommandEmpty>
                              <CommandGroup>
                                {branchOptions.map((b) => (
                                  <CommandItem
                                    key={b.code}
                                    value={`${b.code} ${b.name} ${b.city}`}
                                    onSelect={() => { setBranch(b.code); setBranchOpen(false); }}
                                  >
                                    <span className="font-medium">{b.code}</span>
                                    <span className="mx-1">-</span>
                                    <span className="truncate">{b.name}</span>
                                    {b.city && <span className="text-muted-foreground text-xs mr-auto">{b.city}</span>}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label>מס׳ חשבון</Label>
                    <Input className="h-11 rounded-xl" inputMode="numeric" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="910767" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>שם החותם</Label>
                  <Input className="h-11 rounded-xl" value={signer} onChange={(e) => setSigner(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>שם הארגון</Label>
                  <Input className="h-11 rounded-xl" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>פרטי קשר (טלפון / מייל)</Label>
                <Input className="h-11 rounded-xl" value={contact} onChange={(e) => setContact(e.target.value)} />
              </div>

              <div className="space-y-1">
                <Button type="button" variant="ghost" className="h-9 px-2 text-xs" onClick={() => setShowTemplate((s) => !s)}>
                  {showTemplate ? "הסתר שבלונה" : "ערוך שבלונה (משתנים)"}
                </Button>
                {showTemplate && (
                  <>
                    <Textarea className="rounded-xl min-h-[220px] text-xs font-mono" value={template} onChange={(e) => setTemplate(e.target.value)} />
                    <p className="text-[11px] text-muted-foreground leading-5">
                      משתנים זמינים: {"{{הודעה_ראשית}} {{שם_ההורה}} {{סוג_ביטול}} {{סכום_ששולם}} {{סכום_הזיכוי}} {{הערות}} {{שם_בעל_החשבון}} {{תז_בעל_החשבון}} {{שם_הבנק}} {{מספר_בנק}} {{סניף}} {{מספר_חשבון}} {{שם_החותם}} {{שם_הארגון}} {{פרטי_קשר}}"}
                    </p>
                    <Button type="button" variant="outline" className="h-9 rounded-xl text-xs"
                      onClick={() => { setTemplate(DEFAULT_TEMPLATE); localStorage.removeItem(TEMPLATE_KEY); }}>
                      איפוס לשבלונה המקורית
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Preview */}
            <div className="space-y-3">
              <Label>תצוגה מקדימה</Label>
              <div dir="rtl" className="rounded-xl border border-border bg-card p-5 text-sm leading-7 shadow-sm">
                <img src={logoUrl} alt="" className="h-16 w-auto object-contain mb-2" />
                <div className="text-xs text-muted-foreground">{letterDate}</div>
                <div className="mt-3 font-bold underline">הנדון: ביטול עסקת אשראי {cancelKind} ע"י העברה בנקאית</div>
                {subject && <div className="font-semibold underline mb-3">עבור: {subject}</div>}
                <pre className="whitespace-pre-wrap font-sans">{filled}</pre>
              </div>

              <Button type="button" className="h-12 rounded-xl w-full" onClick={generateFile}>
                <FileDown className="h-4 w-4 ml-2" /> צור קובץ להנהלת החשבונות
              </Button>

              {savedDocs.length > 0 && (
                <div className="rounded-xl border border-border p-3 space-y-2">
                  <p className="text-sm font-semibold">מסמכים שנשמרו</p>
                  {savedDocs.map((d: any) => (
                    <div key={d.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate">
                        {format(new Date(d.created_at), "dd/MM/yyyy HH:mm")}
                        {d.refund_amount ? ` · ₪${Number(d.refund_amount).toLocaleString()}` : ""}
                      </span>
                      <Button type="button" variant="outline" className="h-8 rounded-lg text-xs"
                        onClick={() => openSavedDoc(d.file_path)}>
                        פתח
                      </Button>
                    </div>
                  ))}
                </div>
              )}



              <div className="rounded-xl border border-border p-3 space-y-3">
                <p className="text-sm font-semibold">שלב ב׳ — לאחר ביצוע ההעברה</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>אסמכתא</Label>
                    <Input className="h-11 rounded-xl" value={reference} onChange={(e) => setReference(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>תאריך ההעברה</Label>
                    <Input type="date" className="h-11 rounded-xl" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  className="h-12 rounded-xl w-full"
                  disabled={refundMutation.isPending}
                  onClick={() => {
                    const amt = Number(refundAmount);
                    if (!amt || amt <= 0) { toast.error("נא להזין סכום זיכוי"); return; }
                    if (!reference.trim()) { toast.error("נא להזין אסמכתא של ההעברה"); return; }
                    setConfirmOpen(true);
                  }}
                >
                  {refundMutation.isPending
                    ? <><Loader2 className="h-4 w-4 animate-spin ml-2" />מפיק קבלת זיכוי...</>
                    : "הפק קבלת זיכוי להורה"}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" className="h-11 rounded-xl" disabled={refundMutation.isPending}
              onClick={() => onOpenChange(false)}>סגירה</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>אישור הפקת קבלת זיכוי</AlertDialogTitle>
            <AlertDialogDescription>
              ⚠️ תופק קבלה במינוס ב-iCount על סך ₪{Number(refundAmount || 0).toLocaleString()} (העברה בנקאית, אסמכתא {reference}).
              הפעולה <strong>סופית ובלתי הפיכה</strong> והקבלה תישלח להורה. להמשיך?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => refundMutation.mutate()}>כן, הפק קבלת זיכוי</AlertDialogAction>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default BankTransferRefundDialog;
