import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getTodayInTimezone } from "@/shared/lib/date";
import { toast } from "react-hot-toast";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save, ArrowLeft, Trash2, Plus, AlertTriangle, Info } from "lucide-react";
import { PremiumCard as Card } from "@/shared/components/ui/PremiumCard";
import { PremiumButton as Button } from "@/shared/components/ui/PremiumButton";
import { FormSkeleton } from "@/shared/components/feedback/SkeletonLoader";
import { ErrorState } from "@/shared/components/feedback/ErrorState";
import {
  useDailyMenu,
  useCreateDailyMenu,
  useUpdateDailyMenu,
  useHasOrdersForDate,
} from "../hooks/useDailyMenu";
import { useAuth } from "@/features/auth/hooks/useAuth";

const mealMenuSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string(),
  items: z
    .array(z.object({ value: z.string().min(1, "Item cannot be empty") }))
    .min(1, "At least one item is required"),
  isAvailable: z.boolean(),
});

const menuSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  status: z.enum(["draft", "published", "archived"]),
  breakfast: mealMenuSchema,
  lunch: mealMenuSchema,
  dinner: mealMenuSchema,
});

type MenuFormValues = z.infer<typeof menuSchema>;

export function DailyMenuEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;
  const navigate = useNavigate();
  const { role } = useAuth();
  const basePath = `/${role}/menus`;

  const { data: menu, isLoading, isError, error } = useDailyMenu(id ?? null);
  const { data: hasOrders } = useHasOrdersForDate(menu?.date);
  const createMutation = useCreateDailyMenu();
  const updateMutation = useUpdateDailyMenu();

  const form = useForm<MenuFormValues>({
    resolver: zodResolver(menuSchema),
    defaultValues: {
      date: getTodayInTimezone(),
      status: "draft",
      breakfast: {
        name: "",
        description: "",
        items: [{ value: "" }],
        isAvailable: true,
      },
      lunch: {
        name: "",
        description: "",
        items: [{ value: "" }],
        isAvailable: true,
      },
      dinner: {
        name: "",
        description: "",
        items: [{ value: "" }],
        isAvailable: true,
      },
    },
  });

  useEffect(() => {
    if (menu && isEditing) {
      form.reset({
        date: menu.date,
        status: menu.status,
        breakfast: {
          ...menu.breakfast,
          items: menu.breakfast.items.map((item) => ({ value: item })),
        },
        lunch: {
          ...menu.lunch,
          items: menu.lunch.items.map((item) => ({ value: item })),
        },
        dinner: {
          ...menu.dinner,
          items: menu.dinner.items.map((item) => ({ value: item })),
        },
      });
    }
  }, [menu, isEditing, form]);

  if (isLoading)
    return (
      <div className="p-8">
        <FormSkeleton />
      </div>
    );

  if (isError) {
    return (
      <ErrorState
        title="Could not load menu"
        description={error?.message || "Something went wrong."}
        onRetry={() => navigate(basePath)}
      />
    );
  }

  const onSubmit = async (values: MenuFormValues) => {
    try {
      const dataToSave = {
        date: values.date,
        status: values.status,
        breakfast: {
          ...values.breakfast,
          items: values.breakfast.items.map((i) => i.value),
        },
        lunch: {
          ...values.lunch,
          items: values.lunch.items.map((i) => i.value),
        },
        dinner: {
          ...values.dinner,
          items: values.dinner.items.map((i) => i.value),
        },
      };

      if (isEditing && id) {
        await updateMutation.mutateAsync({ id, data: dataToSave });
      } else {
        await createMutation.mutateAsync(dataToSave);
      }
      navigate(basePath);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save menu.");
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isPublished = isEditing && menu?.status === "published";
  const isLocked = isPublished && Boolean(hasOrders);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(basePath)}>
          <ArrowLeft size={16} />
          Back
        </Button>
        <h1 className="font-display text-2xl font-bold text-ink-900">
          {isEditing ? "Edit Menu" : "Create Menu"}
        </h1>
      </div>

      {isLocked && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-amber-800 dark:text-amber-200 text-sm flex items-center gap-3">
          <AlertTriangle size={20} className="shrink-0 text-amber-500" />
          <div>
            <p className="font-semibold">Menu Locked</p>
            <p>
              Orders have already been generated for this date ({menu?.date}). This menu is locked to protect historical order snapshot integrity.
            </p>
          </div>
        </div>
      )}

      {isPublished && !isLocked && (
        <div className="bg-leaf-500/10 border border-leaf-500/30 rounded-xl p-4 text-leaf-800 dark:text-leaf-200 text-sm flex items-center gap-3">
          <Info size={20} className="shrink-0 text-leaf-600" />
          <div>
            <p className="font-semibold">Published Menu (Revisions Allowed)</p>
            <p>
              No orders have been generated for {menu?.date} yet. You can edit and save dish revisions; they will be applied when orders are generated.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-ink-900 mb-4">
            General Settings
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">
                Business Date
              </label>
              <input
                type="date"
                {...form.register("date")}
                disabled={isEditing || isLocked}
                className="w-full h-10 px-3 rounded-lg border border-rice-200 bg-rice-25 focus:ring-2 focus:ring-turmeric-400 disabled:opacity-60"
              />
              {form.formState.errors.date && (
                <p className="text-danger text-sm mt-1">
                  {form.formState.errors.date.message}
                </p>
              )}
            </div>
          </div>
        </Card>

        <MealEditor
          form={form}
          name="breakfast"
          title="Breakfast"
          disabled={isLocked}
        />
        <MealEditor
          form={form}
          name="lunch"
          title="Lunch"
          disabled={isLocked}
        />
        <MealEditor
          form={form}
          name="dinner"
          title="Dinner"
          disabled={isLocked}
        />

        <div className="flex justify-end gap-3">
          <Button
            variant="ghost"
            type="button"
            onClick={() => navigate(basePath)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button type="submit" isLoading={isSaving} disabled={isSaving || isLocked}>
            <Save size={16} />
            {isLocked
              ? "Locked (Orders Exist)"
              : isEditing
                ? isPublished
                  ? "Save Revision"
                  : "Save Changes"
                : "Create Draft"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function MealEditor({
  form,
  name,
  title,
  disabled,
}: {
  form: any;
  name: "breakfast" | "lunch" | "dinner";
  title: string;
  disabled: boolean;
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: `${name}.items`,
  });

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id={`${name}-available`}
            {...form.register(`${name}.isAvailable`)}
            disabled={disabled}
            className="rounded border-rice-300 text-leaf-600 focus:ring-leaf-600"
          />
          <label
            htmlFor={`${name}-available`}
            className="text-sm font-medium text-ink-700"
          >
            Available
          </label>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 mb-4">
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">
            Menu Name
          </label>
          <input
            {...form.register(`${name}.name`)}
            disabled={disabled}
            placeholder={`e.g. Traditional South Indian ${title}`}
            className="w-full h-10 px-3 rounded-lg border border-rice-200 bg-rice-25 focus:ring-2 focus:ring-turmeric-400"
          />
          {form.formState.errors[name]?.name && (
            <p className="text-danger text-sm mt-1">
              {form.formState.errors[name].name.message}
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">
            Description (Optional)
          </label>
          <input
            {...form.register(`${name}.description`)}
            disabled={disabled}
            placeholder="Special notes or allergens"
            className="w-full h-10 px-3 rounded-lg border border-rice-200 bg-rice-25 focus:ring-2 focus:ring-turmeric-400"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-ink-700 mb-2">
          Menu Items
        </label>
        <div className="space-y-2">
          {fields.map((field, index) => (
            <div key={field.id} className="flex gap-2">
              <div className="flex-1">
                <input
                  {...form.register(`${name}.items.${index}.value`)}
                  disabled={disabled}
                  placeholder={`Item ${index + 1}`}
                  className="w-full h-10 px-3 rounded-lg border border-rice-200 bg-rice-25 focus:ring-2 focus:ring-turmeric-400"
                />
                {form.formState.errors[name]?.items?.[index]?.value && (
                  <p className="text-danger text-sm mt-1">
                    {form.formState.errors[name].items[index].value.message}
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => remove(index)}
                disabled={disabled || fields.length === 1}
                className="shrink-0 text-danger px-2"
              >
                <Trash2 size={16} />
              </Button>
            </div>
          ))}
        </div>
        {!disabled && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => append({ value: "" })}
            className="mt-3"
          >
            <Plus size={16} />
            Add Item
          </Button>
        )}
        {form.formState.errors[name]?.items?.root && (
          <p className="text-danger text-sm mt-1">
            {form.formState.errors[name].items.root.message}
          </p>
        )}
      </div>
    </Card>
  );
}
