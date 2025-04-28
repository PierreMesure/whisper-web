import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from "@headlessui/react";
import { t } from "i18next";
import { Fragment, JSX } from "react";

export interface Props {
    show: boolean;
    onClose: () => void;
    onSubmit?: () => void;
    submitText?: string;
    submitEnabled?: boolean;
    title: string | JSX.Element;
    content: string | JSX.Element;
    cacheSize?: number;
}

export default function Modal({
    show,
    onClose,
    onSubmit,
    title,
    content,
    submitText,
    submitEnabled = true,
    cacheSize = 0,
}: Props) {
    const onClear = () => {
        onClose();
        caches.delete('transformers-cache');
    };
    return (
        <Transition appear show={show} as={Fragment}>
            <Dialog as='div' className='relative z-10' onClose={onClose}>
                <TransitionChild
                    as={Fragment}
                    enter='ease-out duration-300'
                    enterFrom='opacity-0'
                    enterTo='opacity-100'
                    leave='ease-in duration-200'
                    leaveFrom='opacity-100'
                    leaveTo='opacity-0'
                >
                    <div className='fixed inset-0 bg-black bg-opacity-25' />
                </TransitionChild>

                <div className='fixed inset-0 overflow-y-auto'>
                    <div className='flex min-h-full items-center justify-center p-4 text-center'>
                        <TransitionChild
                            as={Fragment}
                            enter='ease-out duration-300'
                            enterFrom='opacity-0 scale-95'
                            enterTo='opacity-100 scale-100'
                            leave='ease-in duration-200'
                            leaveFrom='opacity-100 scale-100'
                            leaveTo='opacity-0 scale-95'
                        >
                            <DialogPanel className='w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all'>
                                <DialogTitle
                                    as='h3'
                                    className='text-lg font-medium leading-6 text-gray-900'
                                >
                                    {title}
                                </DialogTitle>
                                <div className='modal-content mt-3 text-sm text-gray-500'>
                                    {content}
                                </div>

                                <div className='mt-4 flex flex-row-reverse'>
                                    {submitText && (
                                        <button
                                            type='button'
                                            disabled={!submitEnabled}
                                            className={`inline-flex ml-2 justify-center rounded-md border border-transparent ${
                                                submitEnabled
                                                    ? "bg-indigo-600"
                                                    : "bg-grey-300"
                                            } px-4 py-2 text-sm font-medium text-indigo-100 ${
                                                submitEnabled
                                                    ? "hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                                                    : ""
                                            } transition-all duration-300`}
                                            onClick={onSubmit}
                                        >
                                            {submitText}
                                        </button>
                                    )}
                                    <button
                                        type='button'
                                        className='inline-flex ml-2 justify-center rounded-md border border-transparent bg-indigo-100 px-4 py-2 text-sm font-medium text-indigo-900 hover:bg-indigo-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 transition-all duration-300'
                                        onClick={onClose}
                                    >
                                        {t('modal.close')}
                                    </button>
                                {cacheSize != 0 && (
                                    <button
                                        type='button'
                                        className='inline-flex justify-center rounded-md border border-transparent bg-red-100 px-4 py-2 text-sm font-medium text-red-900 hover:bg-red-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 transition-all duration-300'
                                        onClick={onClear}
                                    >
                                        {cacheSize !== -1
                                            ? `${t("manager.clear_cache")} (${cacheSize}MB)`
                                            : t("manager.clear_cache")}
                                    </button>
                                )}
                                </div>
                            </DialogPanel>
                        </TransitionChild>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
}
