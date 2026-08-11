import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ChevronsUpDown } from "lucide-react";
import { ISRAELI_BANKS, findBankByCode } from "@/lib/israeliBanks";
import { getBranches } from "@/lib/israeliBankBranches";

interface Props {
  bankName: string;
  setBankName: (v: string) => void;
  bankCode: string;
  setBankCode: (v: string) => void;
  branch: string;
  setBranch: (v: string) => void;
  size?: "sm" | "md";
}

/** Bank + branch selection with searchable lists and a manual-entry fallback. */
const BankBranchPicker = ({
  bankName,
  setBankName,
  bankCode,
  setBankCode,
  branch,
  setBranch,
  size = "sm",
}: Props) => {
  const [manualBank, setManualBank] = useState(false);
  const [manualBranch, setManualBranch] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);

  const h = size === "sm" ? "h-9" : "h-11 rounded-xl";
  const branchOptions = useMemo(() => (bankCode ? getBranches(bankCode) : []), [bankCode]);
  const selectedBranch = useMemo(
    () => branchOptions.find((b) => b.code === branch),
    [branchOptions, branch],
  );

  return (
    <>
      {/* Bank */}
      <div className="space-y-2">
        <div>
          <Label className="text-xs">קוד בנק</Label>
          <Input
            inputMode="numeric"
            value={bankCode}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "");
              setBankCode(v);
              setBankName(findBankByCode(v)?.name || "");
              setBranch("");
              setManualBranch(false);
            }}
            placeholder="מספר בנק מהצ׳ק"
            className={`${h} w-24 text-center`}
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">שם בנק</Label>
            <Button
              type="button"
              variant="ghost"
              className="h-6 px-1.5 text-[11px]"
              onClick={() => setManualBank((m) => !m)}
            >
              {manualBank ? "בחירה מרשימה" : "אחר"}
            </Button>
          </div>
          {manualBank ? (
            <Input
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="שם הבנק"
              className={h}
            />
          ) : (
            <Select
              value={bankCode && findBankByCode(bankCode) ? bankCode : undefined}
              onValueChange={(v) => {
                setBankCode(v);
                setBankName(findBankByCode(v)?.name || "");
                setBranch("");
                setManualBranch(false);
              }}
            >
              <SelectTrigger className={`${h} w-full`}>
                <SelectValue placeholder="בחר בנק" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {ISRAELI_BANKS.map((b) => (
                  <SelectItem key={b.code} value={b.code}>
                    {b.name} ({b.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Branch */}
      <div className="space-y-2">
        <div>
          <Label className="text-xs">מספר סניף</Label>
          <Input
            inputMode="numeric"
            value={branch}
            onChange={(e) => setBranch(e.target.value.replace(/\D/g, ""))}
            placeholder="מס׳ סניף"
            className={`${h} w-24 text-center`}
          />
        </div>

        {branchOptions.length > 0 && (
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">שם סניף</Label>
              <Button
                type="button"
                variant="ghost"
                className="h-6 px-1.5 text-[11px]"
                onClick={() => setManualBranch((m) => !m)}
              >
                {manualBranch ? "בחירה מרשימה" : "אחר"}
              </Button>
            </div>
            {manualBranch ? (
              <Input
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="מספר סניף"
                className={h}
              />
            ) : (
              <Popover open={branchOpen} onOpenChange={setBranchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={`${h} w-full justify-between font-normal`}
                  >
                    <span className="truncate">
                      {selectedBranch
                        ? `${selectedBranch.name}${selectedBranch.city ? ` - ${selectedBranch.city}` : ""}`
                        : "בחר סניף"}
                    </span>
                    <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[260px]" align="start">
                  <Command filter={(value, search) => (value.includes(search) ? 1 : 0)}>
                    <CommandInput placeholder="חיפוש סניף / עיר / מספר" />
                    <CommandList className="max-h-64">
                      <CommandEmpty>לא נמצא סניף</CommandEmpty>
                      <CommandGroup>
                        {branchOptions.map((b) => (
                          <CommandItem
                            key={b.code}
                            value={`${b.code} ${b.name} ${b.city}`}
                            onSelect={() => {
                              setBranch(b.code);
                              setBranchOpen(false);
                            }}
                          >
                            <span className="font-medium">{b.code}</span>
                            <span className="mx-1">-</span>
                            <span className="truncate">{b.name}</span>
                            {b.city && (
                              <span className="text-muted-foreground text-xs mr-auto">{b.city}</span>
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default BankBranchPicker;
