"use client"

import * as React from "react"
import {
  Controller,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
  FormProvider,
  useFormContext,
} from "react-hook-form"

import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"

// Re-export FormProvider as Form
const Form = FormProvider

// ── Context ──────────────────────────────────────────────────────────────────

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = { name: TName }

const FormFieldContext = React.createContext<FormFieldContextValue>(
  {} as FormFieldContextValue
)

type FormItemContextValue = { id: string }

const FormItemContext = React.createContext<FormItemContextValue>(
  {} as FormItemContextValue
)

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useFormField() {
  const fieldContext = React.useContext(FormFieldContext)
  const itemContext = React.useContext(FormItemContext)
  const { getFieldState, formState } = useFormContext()

  if (!fieldContext.name) {
    throw new Error("useFormField must be used inside <FormField>")
  }

  const fieldState = getFieldState(fieldContext.name, formState)
  const { id } = itemContext

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  }
}

// ── Components ────────────────────────────────────────────────────────────────

function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(props: ControllerProps<TFieldValues, TName>) {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  )
}

function FormItem({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const id = React.useId()
  return (
    <FormItemContext.Provider value={{ id }}>
      <div className={cn("space-y-1.5", className)} {...props} />
    </FormItemContext.Provider>
  )
}

function FormLabel({
  className,
  ...props
}: React.ComponentProps<"label">) {
  const { error, formItemId } = useFormField()
  return (
    <Label
      htmlFor={formItemId}
      className={cn(error && "text-destructive", className)}
      {...props}
    />
  )
}

/**
 * Clones its single child and injects the correct id + aria attributes.
 * This replaces the Radix Slot approach so no extra dependency is needed.
 */
function FormControl({ children }: { children: React.ReactElement<Record<string, unknown>> }) {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField()
  return React.cloneElement(children, {
    id: formItemId,
    "aria-describedby": error
      ? `${formDescriptionId} ${formMessageId}`
      : formDescriptionId,
    "aria-invalid": !!error,
  })
}

function FormDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  const { formDescriptionId } = useFormField()
  return (
    <p
      id={formDescriptionId}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function FormMessage({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  const { error, formMessageId } = useFormField()
  const body = error ? String(error?.message ?? "") : children
  if (!body) return null
  return (
    <p
      id={formMessageId}
      className={cn("text-sm font-medium text-destructive", className)}
      {...props}
    >
      {body}
    </p>
  )
}

export {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
}
