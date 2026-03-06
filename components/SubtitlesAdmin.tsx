import React, { useState, useEffect } from 'react';
import { Trash2, Edit2, Plus, Save, X, Eye } from 'lucide-react';
import { getSubtitlePresets, saveSubtitlePreset, deleteSubtitlePreset } from '../services/storageService';
import { SubtitleStyleOption } from '../types';

const DEFAULT_PRESET: SubtitleStyleOption = {
    id: '',
    label: '',
    maxWordsPerLine: 4,
    fontSize: 48,
    fontFamily: 'Poppins',
    fontWeight: 'bold',
    textColor: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 2,
    shadowColor: '#000000',
    shadowBlur: 4,
    shadowOpacity: 0.5,
    shadowDistance: 2,
    shadowAngle: 45,
    padding: 20,
    yPosition: 80,
    isBold: true,
    isItalic: false,
    textCasing: 'uppercase',
};

export const SubtitlesAdmin: React.FC = () => {
    const [presets, setPresets] = useState<SubtitleStyleOption[]>([]);
    const [isEditing, setIsEditing] = useState(false);
    const [editingPreset, setEditingPreset] = useState<SubtitleStyleOption | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [showPreview, setShowPreview] = useState(false);

    useEffect(() => {
        loadPresets();
    }, []);

    const loadPresets = async () => {
        const data = await getSubtitlePresets();
        setPresets(data);
    };

    const handleCreate = () => {
        setEditingPreset({ ...DEFAULT_PRESET, id: crypto.randomUUID() });
        setIsCreating(true);
        setIsEditing(true);
    };

    const handleEdit = (preset: SubtitleStyleOption) => {
        setEditingPreset({ ...preset });
        setIsCreating(false);
        setIsEditing(true);
    };

    const handleSave = async () => {
        if (!editingPreset) return;

        try {
            const displayOrder = isCreating ? presets.length : presets.findIndex(p => p.id === editingPreset.id);
            await saveSubtitlePreset(editingPreset, displayOrder);
            await loadPresets();
            setIsEditing(false);
            setEditingPreset(null);
            setIsCreating(false);
        } catch (error) {
            alert('Erro ao salvar preset');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Tem certeza que deseja excluir este preset?')) return;

        try {
            await deleteSubtitlePreset(id);
            await loadPresets();
        } catch (error) {
            alert('Erro ao excluir preset');
        }
    };

    const handleCancel = () => {
        setIsEditing(false);
        setEditingPreset(null);
        setIsCreating(false);
    };

    const getPreviewStyle = (preset: SubtitleStyleOption) => ({
        fontSize: `${preset.fontSize}px`,
        fontFamily: preset.fontFamily,
        fontWeight: preset.fontWeight,
        color: preset.textColor,
        textTransform: preset.textCasing as any,
        fontStyle: preset.isItalic ? 'italic' : 'normal',
        textShadow: `${preset.shadowDistance}px ${preset.shadowDistance}px ${preset.shadowBlur}px ${preset.shadowColor}`,
        WebkitTextStroke: `${preset.strokeWidth}px ${preset.strokeColor}`,
    });

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-black uppercase tracking-tighter">Presets de Legendas</h2>
                {!isEditing && (
                    <button
                        onClick={handleCreate}
                        className="bg-brand-600 hover:bg-brand-500 text-white px-6 py-3 rounded-xl font-black uppercase text-xs flex items-center gap-2 transition-all"
                    >
                        <Plus size={16} />
                        Novo Preset
                    </button>
                )}
            </div>

            {isEditing && editingPreset && (
                <div className="bg-slate-900 border border-brand-500 rounded-2xl p-6 space-y-4">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-black uppercase text-brand-400">
                            {isCreating ? 'Criar Novo Preset' : 'Editar Preset'}
                        </h3>
                        <button
                            onClick={() => setShowPreview(!showPreview)}
                            className="text-xs font-black uppercase text-slate-400 hover:text-white flex items-center gap-2"
                        >
                            <Eye size={16} />
                            {showPreview ? 'Ocultar' : 'Mostrar'} Preview
                        </button>
                    </div>

                    {showPreview && (
                        <div className="bg-slate-950 rounded-xl p-8 text-center">
                            <p style={getPreviewStyle(editingPreset)}>EXEMPLO DE LEGENDA</p>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="block text-sm font-bold text-slate-400 mb-2">Nome do Preset</label>
                            <input
                                type="text"
                                value={editingPreset.label}
                                onChange={(e) => setEditingPreset({ ...editingPreset, label: e.target.value })}
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-brand-500 focus:outline-none"
                                placeholder="Ex: Estilo YouTube"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-400 mb-2">Tamanho da Fonte</label>
                            <input
                                type="number"
                                value={editingPreset.fontSize}
                                onChange={(e) => setEditingPreset({ ...editingPreset, fontSize: parseInt(e.target.value) })}
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-brand-500 focus:outline-none"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-400 mb-2">Família da Fonte</label>
                            <input
                                type="text"
                                value={editingPreset.fontFamily}
                                onChange={(e) => setEditingPreset({ ...editingPreset, fontFamily: e.target.value })}
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-brand-500 focus:outline-none"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-400 mb-2">Cor do Texto</label>
                            <input
                                type="color"
                                value={editingPreset.textColor}
                                onChange={(e) => setEditingPreset({ ...editingPreset, textColor: e.target.value })}
                                className="w-full h-12 bg-slate-800 border border-slate-700 rounded-xl cursor-pointer"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-400 mb-2">Cor do Contorno</label>
                            <input
                                type="color"
                                value={editingPreset.strokeColor}
                                onChange={(e) => setEditingPreset({ ...editingPreset, strokeColor: e.target.value })}
                                className="w-full h-12 bg-slate-800 border border-slate-700 rounded-xl cursor-pointer"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-400 mb-2">Largura do Contorno</label>
                            <input
                                type="number"
                                value={editingPreset.strokeWidth}
                                onChange={(e) => setEditingPreset({ ...editingPreset, strokeWidth: parseInt(e.target.value) })}
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-brand-500 focus:outline-none"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-400 mb-2">Cor da Sombra</label>
                            <input
                                type="color"
                                value={editingPreset.shadowColor}
                                onChange={(e) => setEditingPreset({ ...editingPreset, shadowColor: e.target.value })}
                                className="w-full h-12 bg-slate-800 border border-slate-700 rounded-xl cursor-pointer"
                            />
                        </div>

                        <div className="col-span-2 flex items-center gap-6">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={editingPreset.isBold}
                                    onChange={(e) => setEditingPreset({ ...editingPreset, isBold: e.target.checked })}
                                    className="w-5 h-5 rounded bg-slate-800 border-slate-700"
                                />
                                <span className="text-sm font-bold text-slate-400">Negrito</span>
                            </label>

                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={editingPreset.isItalic}
                                    onChange={(e) => setEditingPreset({ ...editingPreset, isItalic: e.target.checked })}
                                    className="w-5 h-5 rounded bg-slate-800 border-slate-700"
                                />
                                <span className="text-sm font-bold text-slate-400">Itálico</span>
                            </label>
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
                            disabled={!editingPreset.label}
                            className="bg-brand-600 hover:bg-brand-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-black uppercase text-xs flex items-center gap-2 transition-all"
                        >
                            <Save size={16} />
                            Salvar
                        </button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {presets.map((preset) => (
                    <div
                        key={preset.id}
                        className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-slate-700 transition-all"
                    >
                        <div className="flex items-start justify-between gap-4 mb-4">
                            <h3 className="text-lg font-bold text-white">{preset.label}</h3>

                            {!isEditing && (
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleEdit(preset)}
                                        className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-all"
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(preset.id)}
                                        className="p-2 bg-slate-800 hover:bg-red-900 rounded-lg text-slate-400 hover:text-red-400 transition-all"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="bg-slate-950 rounded-xl p-4 text-center">
                            <p style={getPreviewStyle(preset)} className="text-sm">PREVIEW</p>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                            <div>
                                <span className="text-slate-500">Fonte:</span>
                                <span className="text-slate-300 ml-2">{preset.fontSize}px {preset.fontFamily}</span>
                            </div>
                            <div>
                                <span className="text-slate-500">Contorno:</span>
                                <span className="text-slate-300 ml-2">{preset.strokeWidth}px</span>
                            </div>
                        </div>
                    </div>
                ))}

                {presets.length === 0 && !isEditing && (
                    <div className="col-span-2 text-center py-12 text-slate-500">
                        <p className="text-sm font-bold">Nenhum preset cadastrado ainda.</p>
                        <p className="text-xs mt-2">Clique em "Novo Preset" para começar.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
