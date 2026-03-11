
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'teacher', 'secretary');
CREATE TYPE public.enrollment_role AS ENUM ('primary', 'secondary');
CREATE TYPE public.lesson_type AS ENUM ('individual', 'group');
CREATE TYPE public.attendance_status AS ENUM ('present', 'double_lesson', 'justified_absence', 'unjustified_absence');
CREATE TYPE public.transaction_type AS ENUM ('payment', 'credit');
CREATE TYPE public.payment_method AS ENUM ('cash', 'check', 'transfer', 'credit_card', 'other');
