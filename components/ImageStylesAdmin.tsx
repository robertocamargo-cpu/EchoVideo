import React, { useState, useEffect } from 'react';
import { Trash2, Edit2, Plus, Save, X } from 'lucide-react';
import { getImageStylePrompts, saveImageStylePrompt, deleteImageStylePrompt } from '../services/storageService';
import { ImageStyleOption } from '../types';

export const ImageStylesAdmin: React.FC = () => {
    const [styles, setStyles] = useState<ImageStyleOption[]>([]);
    const [isEditing, setIsEditing] = useState(false);
    const [editingStyle, setEditingStyle] = useState<ImageStyleOption | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        loadStyles();
    }, []);

    const loadStyles = async () => {
        const data = await getImageStylePrompts();
        setStyles(data);
    };

    const handleCreate = () => {
        setEditingStyle({
            id: crypto.randomUUID(),
            label: '',
            prompt: '',
        });
        setIsCreating(true);
        setIsEditing(true);
    };

    const handleEdit = (style: ImageStyleOption) => {
        setEditingStyle({ ...style });
        setIsCreating(false);
        setIsEditing(true);
    };

    const handleSave = async () => {
        if (!editingStyle) return;

        try {
            const displayOrder = isCreating ? styles.length : styles.findIndex(s => s.id === editingStyle.id);
            await saveImageStylePrompt(editingStyle, displayOrder);
            await loadStyles();
            setIsEditing(false);
            setEditingStyle(null);
            setIsCreating(false);
        } catch (error) {
            alert('Erro ao salvar estilo');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Tem certeza que deseja excluir este estilo?')) return;

        try {
            await deleteImageStylePrompt(id);
            await loadStyles();
        } catch (error) {
            alert('Erro ao excluir estilo');
        }
    };

    const handleCancel = () => {
        setIsEditing(false);
        setEditingStyle(null);
        setIsCreating(false);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-black uppercase tracking-tighter">Estilos de Imagem</h2>
                {!isEditing && (
                    <button
                        onClick={handleCreate}
                        className="bg-brand-600 hover:bg-brand-500 text-white px-6 py-3 rounded-xl font-black uppercase text-xs flex items-center gap-2 transition-all"
                    >
                        <Plus size={16} />
                        Novo Estilo
                    </button>
                )}
            </div>

            {isEditing && editingStyle && (
                <div className="bg-slate-900 border border-brand-500 rounded-2xl p-6 space-y-4">
                    <h3 className="text-lg font-black uppercase text-brand-400">
                        {isCreating ? 'Criar Novo Estilo' : 'Editar Estilo'}
                    </h3>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-slate-400 mb-2">Nome do Estilo</label>
                            <input
                                type="text"
                                value={editingStyle.label}
                                onChange={(e) => setEditingStyle({ ...editingStyle, label: e.target.value })}
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-brand-500 focus:outline-none"
                                placeholder="Ex: Disney / Pixar (Animação 3D)"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-400 mb-2">Prompt do Estilo</label>
                            <textarea
                                value={editingStyle.prompt}
                                onChange={(e) => setEditingStyle({ ...editingStyle, prompt: e.target.value })}
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-brand-500 focus:outline-none min-h-[150px]"
                                placeholder="Descreva o estilo visual que será aplicado às imagens..."
                            />
                        </div>
                    </div>

                    <div className="flex gap-3 justify-end">
                        <button
                            onClick={handleCancel}
                            className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-3 rounded-xl font-black uppercase text-xs flex items-center gap-2 transition-all"
                        >
                            <X size={16} />
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!editingStyle.label || !editingStyle.prompt}
                            className="bg-brand-600 hover:bg-brand-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-black uppercase text-xs flex items-center gap-2 transition-all"
                        >
                            <Save size={16} />
                            Salvar
                        </button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {styles.map((style) => (
                    <div
                        key={style.id}
                        className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-slate-700 transition-all"
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 space-y-2">
                                <h3 className="text-lg font-bold text-white">{style.label}</h3>
                                <p className="text-sm text-slate-400 line-clamp-3">{style.prompt}</p>
                            </div>

                            {!isEditing && (
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleEdit(style)}
                                        className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-all"
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(style.id)}
                                        className="p-2 bg-slate-800 hover:bg-red-900 rounded-lg text-slate-400 hover:text-red-400 transition-all"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {styles.length === 0 && !isEditing && (
                    <div className="col-span-2 text-center py-12 text-slate-500">
                        <p className="text-sm font-bold">Nenhum estilo cadastrado ainda.</p>
                        <p className="text-xs mt-2">Clique em "Novo Estilo" para começar.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
